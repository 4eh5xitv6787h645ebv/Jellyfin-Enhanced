import { chromeBridge } from './host';
import { initializePluginRevisions, type PluginRevisionsBridge } from './plugin-revisions';

const JE = chromeBridge<PluginRevisionsBridge>();
JE.initializePluginRevisions = () => initializePluginRevisions(JE);
