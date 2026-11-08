import { createUi } from './runtime';
import { browserUiHost, uiBridge } from '../../host/ui-host';

const bridge = uiBridge();
const core = bridge.core ?? (bridge.core = {});
const ui = core.ui ?? (core.ui = createUi(browserUiHost(bridge)));
bridge.escapeHtml = ui.escapeHtml;
bridge.toast = ui.toast;
