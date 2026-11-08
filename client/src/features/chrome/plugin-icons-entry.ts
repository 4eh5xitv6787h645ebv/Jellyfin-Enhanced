import { optionalBridge } from '../../host/chrome-host';
import { createPluginIcons, type PluginIconsBridge } from './plugin-icons';

const JE = optionalBridge<PluginIconsBridge>();
if (JE) {
    const icons = createPluginIcons(JE);
    JE.initializePluginIcons = icons.initialize;
    JE.stopPluginIconsMonitoring = icons.stopMonitoring;
    // Configuration page "Test Links" forces a reload of the custom links.
    JE.customPlugins = { refresh: icons.refresh };
}
