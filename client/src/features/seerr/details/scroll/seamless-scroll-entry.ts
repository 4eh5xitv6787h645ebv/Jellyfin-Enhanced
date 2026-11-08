import { bridgeOrNew } from '../../../../host/seerr-details-host';
import { CONFIG, cardsNeeded, createDeduplicator, createScrollEngine } from './seamless-scroll';

const JE = bridgeOrNew();
const { setupInfiniteScroll, cleanupInfiniteScroll } = createScrollEngine(JE);
JE.seamlessScroll = { createDeduplicator, cardsNeeded, setupInfiniteScroll, cleanupInfiniteScroll, CONFIG };
