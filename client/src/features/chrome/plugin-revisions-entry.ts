import { chromeBridge } from '../../host/chrome-host';
import { initializePluginRevisions, type PluginRevisionsBridge } from './plugin-revisions';

const JE = chromeBridge<PluginRevisionsBridge>();
JE.initializePluginRevisions = () => initializePluginRevisions(JE);
