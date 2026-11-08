import { chromeBridge, hostClient } from '../../host/chrome-host';
import { createActiveStreams, type ActiveStreamsBridge, type ActiveStreamsClient } from './active-streams';

const JE = chromeBridge<ActiveStreamsBridge>();
const streams = createActiveStreams(JE, () => hostClient<ActiveStreamsClient>());
JE.activeStreams = { initialize: streams.initialize, destroy: streams.destroy };
streams.bindSession();
