import { PosStore } from "@point_of_sale/app/store/pos_store";
import { patch } from "@web/core/utils/patch";

patch(PosStore.prototype, {
    // @Override
    // get idleTimeout() {
    //     console.log(this.mainScreen.component.name )
    //     console.log([
    //         {
    //             timeout: 5, // 5 minutes
    //             action: () =>
    //                 this.mainScreen.component.name !== "PaymentScreen" &&
    //                 this.showScreen("SaverScreen"),
    //         },
    //         {
    //             timeout: 120000, // 2 minutes
    //             action: () =>
    //                 this.mainScreen.component.name === "LoginScreen" &&
    //                 this.showScreen("SaverScreen"),
    //         },
    //     ]);
    //     return [
    //         {
    //             timeout: 5, // 5 minutes
    //             action: () =>
    //                 this.mainScreen.component.name !== "PaymentScreen" &&
    //                 this.showScreen("SaverScreen"),
    //         },
    //         {
    //             timeout: 120000, // 2 minutes
    //             action: () =>
    //                 this.mainScreen.component.name === "LoginScreen" &&
    //                 this.showScreen("SaverScreen"),
    //         },
    //     ];
    // }
});
