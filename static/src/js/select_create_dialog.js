/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { SelectCreateDialog } from "@web/views/view_dialogs/select_create_dialog";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useState, onWillStart } from "@odoo/owl";
export class SelectCreateDialogEx extends SelectCreateDialog {
  setup() {
    super.setup();
  }

  get viewProps() {
    const type = "kanban";
    const props = {
      loadIrFilters: true,
      ...this.baseViewProps,
      context: this.props.context,
      domain: this.props.domain,
      dynamicFilters: this.props.dynamicFilters,
      resModel: this.props.resModel,
      viewId: this.props.isViewId,
      searchViewId: this.props.searchViewId,
      forceGlobalClick: true,
      type,
    };
    return props;
  }
}
SelectCreateDialogEx.props = {
  ...SelectCreateDialog.props,
  isViewId: { type: [Number, { value: false }], optional: true },
};
SelectCreateDialogEx.template = "investor.SelectCreateDialog";

registry.category("dialogs").add("select_create_ex", SelectCreateDialogEx);
