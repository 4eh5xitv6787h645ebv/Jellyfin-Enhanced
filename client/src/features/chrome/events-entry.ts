import { chromeBridge } from '../../host/chrome-host';
import { canonicalCombo, createEvents, type EventsBridge } from './events';

const JE = chromeBridge<EventsBridge>();
// The shortcut editor's conflict check compares bindings the same way.
JE.internals = JE.internals || {};
JE.internals.canonicalCombo = canonicalCombo;
const events = createEvents(JE);
JE.keyListener = events.keyListener;
JE.initializeEnhancedScript = events.initializeEnhancedScript;
