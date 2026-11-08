import { chromeBridge } from '../../host/chrome-host';
import { createHeaderActions, type HeaderActionsBridge } from './header-actions';

const JE = chromeBridge<HeaderActionsBridge>();
const actions = createHeaderActions(JE);
JE.session.onUserChange('header-actions', actions.resetForIdentity);
JE.headerActions = { getTray: actions.getTray };
