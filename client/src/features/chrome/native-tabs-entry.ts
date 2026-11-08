import { chromeBridge, hostClient } from '../../host/chrome-host';
import { createNativeTabs, type NativeTabsBridge, type NativeTabsClient } from './native-tabs';

const JE = chromeBridge<NativeTabsBridge>();
const tabs = createNativeTabs(JE, () => hostClient<NativeTabsClient>());
JE.nativeTabs = tabs.facade;
tabs.start();
