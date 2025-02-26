import { _t } from "@web/core/l10n/translation";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { OnlinePaymentPopup } from "@pos_online_payment/app/online_payment_popup/online_payment_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { qrCodeSrc } from "@point_of_sale/utils";
import { ask } from "@point_of_sale/app/store/make_awaitable_dialog";
import { user } from "@web/core/user";
patch(PaymentScreen.prototype, {
  getVNPayExpDate() {
    // Create expiration date 15 minutes from now
    const now = new Date();
    now.setMinutes(now.getMinutes() + 15);

    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");

    return `${year}${month}${day}${hours}${minutes}`;
  },

  formatDisplayTime(expDateString) {
    // Convert yyMMddHHmm to display format
    const hours = expDateString.slice(6, 8);
    const minutes = expDateString.slice(8, 10);
    return `${hours}:${minutes}`;
  },

  async addNewPaymentLine(paymentMethod) {
    if (
      paymentMethod.is_online_payment &&
      typeof this.currentOrder.id === "string"
    ) {
      this.currentOrder.date_order = luxon.DateTime.now().toFormat(
        "yyyy-MM-dd HH:mm:ss"
      );
      this.pos.addPendingOrder([this.currentOrder.id]);
      await this.pos.syncAllOrders();
    }
    return await super.addNewPaymentLine(...arguments);
  },
  getRemainingOnlinePaymentLines() {
    return this.paymentLines.filter(
      (line) =>
        line.payment_method_id.is_online_payment &&
        line.get_payment_status() !== "done"
    );
  },

  async _processVNPayQRPayment(paymentLine) {
    const amount = paymentLine.get_amount();
    const order_reference =
      this.env.services.company.currentCompany.id.toString() +
      "." +
      user.partnerId.toString() +
      "." +
      this.props.orderUuid;
    try {
      const response = await this.env.services.orm.call(
        "payment.provider",
        "vnpay_generate_qr",
        [
          paymentLine.payment_method_id.id,
          amount,
          order_reference,
          this.getVNPayExpDate(),
        ], // Thêm expDate với định dạng yêu cầu],
        {}
      );

      if (!response.success) {
        throw new Error(response.error || "QR Generation failed");
      }

      const vnpayData = {
        formattedAmount: this.env.utils.formatCurrency(amount),
        qrCode: response.qr_data,
        orderName: this.currentOrder.name,
        order_reference: order_reference,
      };
      return vnpayData;
    } catch (error) {
      this.dialog.add(AlertDialog, {
        title: _t("VNPAY QR Payment Error"),
        body: error.message || _t("Failed to process VNPAY QR payment"),
      });
      return false;
    }
  },

  checkRemainingOnlinePaymentLines(unpaidAmount) {
    const remainingLines = this.getRemainingOnlinePaymentLines();
    let remainingAmount = 0;
    let amount = 0;
    for (const line of remainingLines) {
      amount = line.get_amount();
      if (amount <= 0) {
        this.dialog.add(AlertDialog, {
          title: _t("Invalid online payment"),
          body: _t(
            "Online payments cannot have a negative amount (%s: %s).",
            line.payment_method_id.name,
            this.env.utils.formatCurrency(amount)
          ),
        });
        return false;
      }
      remainingAmount += amount;
    }
    if (!this.env.utils.floatIsZero(unpaidAmount - remainingAmount)) {
      this.dialog.add(AlertDialog, {
        title: _t("Invalid online payments"),
        body: _t(
          "The total amount of remaining online payments to execute (%s) doesn't correspond to the remaining unpaid amount of the order (%s).",
          this.env.utils.formatCurrency(remainingAmount),
          this.env.utils.formatCurrency(unpaidAmount)
        ),
      });
      return false;
    }
    return true;
  },
  //@override
  async _isOrderValid(isForceValidate) {
    if (!(await super._isOrderValid(...arguments))) {
      return false;
    }

    if (!this.payment_methods_from_config.some((pm) => pm.is_online_payment)) {
      return true;
    }

    if (this.currentOrder.finalized) {
      this.afterOrderValidation(false);
      return false;
    }

    const onlinePaymentLines = this.getRemainingOnlinePaymentLines();
    if (onlinePaymentLines.length > 0) {
      if (!this.currentOrder.id) {
        this.cancelOnlinePayment(this.currentOrder);
        this.dialog.add(AlertDialog, {
          title: _t("Online payment unavailable"),
          body: _t("The QR Code for paying could not be generated."),
        });
        return false;
      }
      let prevOnlinePaymentLine = null;
      let lastOrderServerOPData = null;
      for (const onlinePaymentLine of onlinePaymentLines) {
        const onlinePaymentLineAmount = onlinePaymentLine.get_amount();
        // The local state is not aware if the online payment has already been done.
        lastOrderServerOPData =
          await this.pos.update_online_payments_data_with_server(
            this.currentOrder,
            onlinePaymentLineAmount
          );
        if (!lastOrderServerOPData) {
          this.dialog.add(AlertDialog, {
            title: _t("Online payment unavailable"),
            body: _t(
              "There is a problem with the server. The order online payment status cannot be retrieved."
            ),
          });
          return false;
        }
        if (!lastOrderServerOPData.is_paid) {
          if (lastOrderServerOPData.modified_payment_lines) {
            this.cancelOnlinePayment(this.currentOrder);
            this.dialog.add(AlertDialog, {
              title: _t("Updated online payments"),
              body: _t(
                "There are online payments that were missing in your view."
              ),
            });
            return false;
          }
          if (
            (prevOnlinePaymentLine &&
              prevOnlinePaymentLine?.get_payment_status() !== "done") ||
            !this.checkRemainingOnlinePaymentLines(
              lastOrderServerOPData.amount_unpaid
            )
          ) {
            this.cancelOnlinePayment(this.currentOrder);
            return false;
          }
          const vnpayData = await this._processVNPayQRPayment(
            onlinePaymentLine
          );
          if (!vnpayData) {
            return false;
          }
          onlinePaymentLine.set_payment_status("waiting");
          this.currentOrder.select_paymentline(onlinePaymentLine);
          const onlinePaymentData = {
            formattedAmount: this.env.utils.formatCurrency(
              onlinePaymentLineAmount
            ),
            qrCode: "data:image/png;base64," + vnpayData.qrCode,
            orderName: this.currentOrder.pos_reference,
          };
          this.currentOrder.onlinePaymentData = onlinePaymentData;

          const channel = `vnpay_payment_${vnpayData.order_reference}`;
          this.env.services.bus_service.addChannel(channel);

          const qrCodePopupCloser = this.dialog.add(
            OnlinePaymentPopup,
            onlinePaymentData,
            {
              onClose: () => {
                this.env.services.bus_service.deleteChannel(channel);
                onlinePaymentLine.onlinePaymentResolver(false);
              },
            }
          );

          const paymentResult = await new Promise((resolve) => {
            onlinePaymentLine.onlinePaymentResolver = resolve;
            this.env.services.bus_service.subscribe(
              "payment_vnpayQR_update",
              (event) => {
                if (event.data.txnId === vnpayData.order_reference) {
                  if (event.data.status === "done") {
                    onlinePaymentLine.paymentCompleted = true;
                    
                    resolve(true);
                  } else if (data.status === "error") {
                    console.error(
                      `Payment failed for txnId: ${vnpayData.order_reference}`,
                      data.message
                    );
                    this.dialog.add(AlertDialog, {
                      title: _t("Payment Failed"),
                      body: _t(data.message || "Thanh toán không thành công."),
                    });
                    resolve(false);
                  }
                }
              }
            );
          });

          if (!paymentResult) {
            this.cancelOnlinePayment(this.currentOrder);
            onlinePaymentLine.set_payment_status(undefined);
            return false;
          }
          qrCodePopupCloser();
          this.env.services.bus_service.deleteChannel(channel);
          if (onlinePaymentLine.get_payment_status() === "waiting") {
            onlinePaymentLine.set_payment_status(undefined);
          }
          prevOnlinePaymentLine = onlinePaymentLine;
        }
      }

      if (!lastOrderServerOPData || !lastOrderServerOPData.is_paid) {
        lastOrderServerOPData =
          await this.pos.update_online_payments_data_with_server(
            this.currentOrder,
            0
          );
      }
      console.log(1)
      if (!lastOrderServerOPData || !lastOrderServerOPData.is_paid) {
        return false;
      }
      console.log(2)

      await this.afterPaidOrderSavedOnServer(lastOrderServerOPData.paid_order);
      return false; // Cancel normal flow because the current order is already saved on the server.
    } else if (typeof this.currentOrder.id === "number") {
      const orderServerOPData =
        await this.pos.update_online_payments_data_with_server(
          this.currentOrder,
          0
        );
      if (!orderServerOPData) {
        return ask(this.dialog, {
          title: _t("Online payment unavailable"),
          body: _t(
            "There is a problem with the server. The order online payment status cannot be retrieved. Are you sure there is no online payment for this order ?"
          ),
          confirmLabel: _t("Yes"),
        });
      }
      if (orderServerOPData.is_paid) {
        await this.afterPaidOrderSavedOnServer(orderServerOPData.paid_order);
        return false; // Cancel normal flow because the current order is already saved on the server.
      }
      if (orderServerOPData.modified_payment_lines) {
        this.dialog.add(AlertDialog, {
          title: _t("Updated online payments"),
          body: _t("There are online payments that were missing in your view."),
        });
        return false;
      }
    }
    return true;
  },
  cancelOnlinePayment(order) {
    // Remove the draft order from the server if there is no done online payment
    this.pos.update_online_payments_data_with_server(order, 0);
  },
  async afterPaidOrderSavedOnServer(orderJSON) {
    if (!orderJSON) {
      this.dialog.add(AlertDialog, {
        title: _t("Server error"),
        body: _t("The saved order could not be retrieved."),
      });
      return;
    }
    console.log(3)

    // Update the local order with the data from the server, because it's the server
    // that is responsible for saving the final state of an order when there is an
    // online payment in it.
    // This prevents the case where the cashier changes the payment lines after the
    // order is paid with an online payment and the server saves the order as paid.
    // Without that update, the payment lines printed on the receipt ticket would
    // be invalid.
    const isInvoiceRequested = this.currentOrder.is_to_invoice();
    if (!orderJSON[0] || this.currentOrder.id !== orderJSON[0].id) {
      
      this.dialog.add(AlertDialog, {
        title: _t("Order saving issue"),
        body: _t("The order has not been saved correctly on the server."),
      });
      return;
    }

    this.currentOrder.state = "paid";
    this.pos.validated_orders_name_server_id_map[this.currentOrder.name] =
      this.currentOrder.id;

    // Now, do practically the normal flow
    if (
      (this.currentOrder.is_paid_with_cash() ||
        this.currentOrder.get_change()) &&
      this.pos.config.iface_cashdrawer
    ) {
      this.hardwareProxy.printer.openCashbox();
    }

    if (isInvoiceRequested) {
      if (!orderJSON[0].raw.account_move) {
        this.dialog.add(AlertDialog, {
          title: _t("Invoice could not be generated"),
          body: _t("The invoice could not be generated."),
        });
      } else {
        await this.invoiceService.downloadPdf(orderJSON[0].raw.account_move);
      }
    }

    await this.postPushOrderResolve([this.currentOrder.server_id]);
    console.log(4)

    this.afterOrderValidation(true);
  },
});
