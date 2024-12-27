/** @odoo-module **/

import { registry } from "@web/core/registry";
import { InputMoneyPopup } from "./input_money_popup";
import { _t } from "@web/core/l10n/translation";

export const vnpayService = {
  dependencies: ["notification", "orm", "rpc", "popup", "user"],
  start(env, { notification, orm, rpc, popup, user }) {
    let partner_id = 0;
    let messageCallback;
    let messageCallback1;
    let crypto_wallet = 0;
    let lang = user.lang.replace("_", "-");
    async function createVnpayUrl(amount) {
      try {
        const paymentUrl = await orm.call(
          "payment.provider",
          "create_vnpay_payment_url",
          [],
          {
            amount: amount,
          }
        );

        if (!paymentUrl) {
          throw new Error("Không thể tạo URL thanh toán VNPAY");
        }

        return paymentUrl;
      } catch (error) {
        console.error("Lỗi khi tạo URL thanh toán VNPAY:", error);
        // Xử lý lỗi ở đây (ví dụ: hiển thị thông báo lỗi cho người dùng)
      }
    }

    async function paynow(amount) {
      // Tạo URL thanh toán VNPAY
      const vnpayUrl = await createVnpayUrl(amount);

      // Mở cửa sổ thanh toán VNPAY
      const width = 765;
      const height = 765;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      window.open(
        vnpayUrl,
        "VNPAY Payment",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      window.onmessage = async function (e) {
        if (e.data.type === "PAYMENT") {
          try {
            const crypto_wallet = await savePayment(e.data);

            messageCallback(crypto_wallet);
            messageCallback1(crypto_wallet);
          } catch (error) {
            console.log(error);
            notification.add(_t("Nạp tiền thất bại!!"), {
              type: "danger",
            });
          }
        }
      };
      return;
    }

    function formatAmount(amount) {
      try {
        return Number(amount).toLocaleString(lang, {
          maximumFractionDigits: 0,
          minimumFractionDigits: 0,
        });
      } catch (error) {
        console.error("Error formatting amount:", error);
        return Number(amount).toLocaleString("en-US");
      }
    }
    function reverseFormatAmount(formattedAmount) {
      if (!formattedAmount) return 0;

      // Get the thousands separator for the given locale
      const locale = new Intl.NumberFormat(lang).format(1111).replace(/1/g, "");

      // Create a RegExp to remove the locale-specific separator
      const separatorRegex = new RegExp(`[${locale}\\s]`, "g");

      // Remove locale-specific separators
      const cleanAmount = formattedAmount.replace(separatorRegex, "");

      // Convert to number
      const number = parseInt(cleanAmount, 10);
      return isNaN(number) ? 0 : number;
    }
    async function savePayment(data) {
      if (data.vnp_ResponseCode == "00") {
        await orm.write("res.partner", [partner_id], {
          crypto_wallet: data.vnp_Amount,
        });

        const amount = reverseFormatAmount(crypto_wallet) + data.vnp_Amount;
        crypto_wallet = formatAmount(amount);

        const data_response = await rpc("/payment/vnpay/create_invoice", {
          amount: data.vnp_Amount,
          partner_id: partner_id,
          payment_method: "pay",
          reference: data.order_id,
        });
        notification.add(
          _t(`Nạp ${formatAmount(data.vnp_Amount)} ₫ thành công!!`),
          {
            type: "success",
          }
        );
        return crypto_wallet;
      }
    }

    async function onRecharge(partner_id_input, crypto_wallet_input) {
      partner_id = partner_id_input;
      crypto_wallet = crypto_wallet_input;
      // let viewKanban = await orm.searchRead(
      //   "ir.model.data",
      //   [["name", "=", "product_view_form_packet_money_kanban"]],
      //   ["res_id"]
      // );
      // const viewKanbanId = viewKanban[0].res_id;
      await popup.add(InputMoneyPopup, {
        title: _t("Nhập Số Tiền Bạn Muốn Nạp!"),
        list_packet_money: [
          "1000000",
          "5000000",
          "10000000",
          "30000000",
          "50000000",
          "100000000",
          "150000000",
          "200000000",
        ],
      });
    }

    return {
      onRecharge: (partner_id_input, crypto_wallet_input) => {
        onRecharge(partner_id_input, crypto_wallet_input);
      },
      formatAmount: (amount) => {
        return formatAmount(amount);
      },
      reverseFormatAmount: (formattedAmount) => {
        return reverseFormatAmount(formattedAmount);
      },
      messageCallback: (callback) => {
        messageCallback = callback;
      },
      messageCallback1: (callback) => {
        messageCallback1 = callback;
      },
      paynow: async (amount) => {
        return await paynow(amount);
      },
    };
  },
};

registry.category("services").add("vnpay", vnpayService);
