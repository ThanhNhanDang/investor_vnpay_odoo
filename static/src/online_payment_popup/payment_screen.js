import { _t } from "@web/core/l10n/translation";
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { OnlinePaymentPopup } from "@pos_online_payment/app/online_payment_popup/online_payment_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { qrCodeSrc } from "@point_of_sale/utils";
import { ask } from "@point_of_sale/app/store/make_awaitable_dialog";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";
import { formatDateTime } from "@web/core/l10n/dates";
import { CustomPrintOrderReceipt } from "./custom_print_order_receipt";
import { onWillUnmount, onWillStart } from "@odoo/owl";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
const { DateTime } = luxon;
import { formatCurrency as webFormatCurrency } from "@web/core/currency";

import { user } from "@web/core/user";
patch(PaymentScreen.prototype, {
  formatMonetary(price) {
    return webFormatCurrency(price, this.currency.id);
  },
  setup() {
    super.setup(...arguments);
    this.config = this.pos.models["pos.config"].getFirst();
    this.currency = this.config.currency_id;
    this.webSocket = useService("webSocket");
    this.notification = useService("notification");
    this.renderer = useService("renderer");
    onWillStart(async () => await this.initialize());
    onWillUnmount(this.webSocket.disconnect);
  },
  async initialize() {
    this.webSocket.connect();
    this.webSocket.onMessage(this.handleWebSocketMessage.bind(this));
  },
  async handleWebSocketMessage(e) {
    try {
      console.log(e.data);
      this.notification.add(_t(e.data), {
        type: "success",
        sticky: true,
      });
    } catch (error) {
      console.log(error);
    }
  },
  getVNPayExpDate() {
    // Create expiration date 15 minutes from now
    const now = new Date();
    now.setMinutes(now.getMinutes() + 16);
    const year = now.getFullYear().toString().slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}${hours}${minutes}`;
  },
  getVNPayExpDateFull() {
    // Create expiration date 15 minutes from now
    const now = new Date();
    const year = now.getFullYear(); // Full year (YYYY)
    const month = String(now.getMonth() + 1).padStart(2, "0"); // Month (mm)
    const day = String(now.getDate()).padStart(2, "0"); // Day (DD)
    const hours = String(now.getHours()).padStart(2, "0"); // Hours (hh)
    const minutes = String(now.getMinutes()).padStart(2, "0"); // Minutes (MM)
    const seconds = String(now.getSeconds()).padStart(2, "0"); // Seconds (SS)

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
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
    const expDate = this.getVNPayExpDate();
    const expDateFull = this.getVNPayExpDateFull();
    const order_reference =
      `${user.partnerId.toString()}${this.env.services.company.currentCompany.id.toString()}${
        this.currentOrder.id
      }${paymentLine.payment_method_id.id}`.substring(0, 15);
    try {
      const response = await this.env.services.orm.call(
        "payment.provider",
        "vnpay_generate_qr",
        [
          paymentLine.payment_method_id.id,
          amount,
          order_reference,
          expDate,
          expDateFull,
          this.currentOrder.id,
          user.partnerId,
          this.env.services.company.currentCompany.id,
        ], // Thêm expDate với định dạng yêu cầu],
        {}
      );

      if (!response.success) {
        this.dialog.add(AlertDialog, {
          title: _t("VNPAY Payment Error"),
          body:
            response.error ||
            _t("Failed to process VNPAY " + response.type + " Payment"),
        });
        return false;
      }

      const vnpayData = {
        formattedAmount: this.env.utils.formatCurrency(amount),
        qrCode: response.qr_data,
        orderName: this.currentOrder.name,
        order_reference: order_reference,
        expDate: expDate,
        type: response.type,
        displayExpTime: this.formatDisplayTime(expDate),
      };
      return vnpayData;
    } catch (error) {
      this.dialog.add(AlertDialog, {
        title: _t("VNPAY Payment Error"),
        body: error.message || _t("Failed to process VNPAY Payment"),
      });
      return false;
    }
  },
  formatDisplayTime(expDateString) {
    // Convert yyMMddHHmm to display format
    const hours = expDateString.slice(6, 8);
    const minutes = expDateString.slice(8, 10);
    return `${hours} giờ:${minutes} phút`;
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
            !this.checkRemainingOnlinePaymentLines_2(
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
          const channel = `vnpay_payment_${vnpayData.order_reference}`;
          if (vnpayData.type === "Refund") {
            if (onlinePaymentLine.get_payment_status() === "waiting") {
              onlinePaymentLine.set_payment_status(undefined);
            }
            prevOnlinePaymentLine = onlinePaymentLine;
          } else if (vnpayData.type === "QR") {
            const onlinePaymentData = {
              formattedAmount: this.env.utils.formatCurrency(
                onlinePaymentLineAmount
              ),
              qrCode: "data:image/png;base64," + vnpayData.qrCode,
              orderName: this.currentOrder.pos_reference,
              displayExpTime: vnpayData.displayExpTime,
              expDate: vnpayData.expDate,
            };
            this.currentOrder.onlinePaymentData = onlinePaymentData;

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
                async (event) => {
                  if (event.data.txnId === vnpayData.order_reference) {
                    if (event.data.status === "done") {
                      onlinePaymentLine.paymentCompleted = true;

                      await rpc("/api/vnpay-qr/create-transaction", {
                        amount: onlinePaymentLine.get_amount(),
                        partner_id: user.partnerId,
                        company_id: this.env.services.company.currentCompany.id,
                        txnId: event.data.txnId,
                        pos_order_id: this.currentOrder.id,
                        qrTrace: event.data.qrTrace,
                      });
                      resolve(true);
                    } else if (data.status === "error") {
                      console.error(
                        `Payment failed for txnId: ${vnpayData.order_reference}`,
                        data.message
                      );
                      this.dialog.add(AlertDialog, {
                        title: _t("Payment Failed"),
                        body: _t(
                          data.message || "Thanh toán không thành công."
                        ),
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
          }
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
      if (!lastOrderServerOPData || !lastOrderServerOPData.is_paid) {
        return false;
      }

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

    this.afterOrderValidation(true);
  },

  async afterOrderValidation(suggestToSync = true) {
    await this.downloadReceipt();
    return await super.afterOrderValidation(...arguments);
  },

  async downloadReceipt() {
    const order = this.pos.models["pos.order"].getBy(
      "uuid",
      this.currentOrder.uuid
    );
    order.tracking_number = "S" + order.tracking_number;

    // const link = document.createElement("a");
    // const currentDate = formatDateTime(luxon.DateTime.now(), {
    //   format: "MM_dd_yyyy-HH_mm_ss",
    // });
    // const companyName =
    //   this.env.services.company.currentCompany.name.replaceAll(" ", "_");
    // link.download = `${companyName}-${currentDate}.png`;
    const Jpeg = await this.renderer.toJpeg(
      CustomPrintOrderReceipt,
      {
        data: this.pos.orderExportForPrinting(order),
        formatCurrency: this.formatMonetary.bind(this),
      },
      {}
    );
    // link.href = png.toDataURL().replace("data:image/jpeg;base64,", "");
    // link.click();

    if (this.webSocket.isConnect() == 1) {
      this.webSocket.send(Jpeg);
      this.notification.add(_t("Gửi thành công"), {
        type: "success",
      });
    }
  },

  checkRemainingOnlinePaymentLines_2(unpaidAmount) {
    const remainingLines = this.getRemainingOnlinePaymentLines();
    let remainingAmount = 0;
    let amount = 0;

    for (const line of remainingLines) {
      amount = line.get_amount();
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
});
