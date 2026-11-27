// Ultra-HD 512x512 Studio Ghibli Sleeping Polar Bear (3x2) 60 FPS GPU Optical-Flow Manifest
export const BEAR_ATLAS_META = { cell: 512, cols: 3, rows: 2, flowTile: 128, flowCols: 4, flowRows: 2, maxFlowPx: 44.0 };
export const BEAR_TILES_90 = {"bearSettleLoop":[0,0],"bearSleepMid":[1,0],"bearSleepInhale":[2,0],"bearPeekSquint":[0,1],"bearSnuggle":[1,1],"bearDrowsySmile":[2,1]};
export const BEAR_FLOW_MAP = {"bearSettleLoop->bearSleepMid":[0,0],"bearSleepMid->bearSleepInhale":[1,0],"bearSleepInhale->bearSleepMid":[2,0],"bearSleepMid->bearSettleLoop":[3,0],"bearSleepMid->bearPeekSquint":[0,1],"bearSleepMid->bearDrowsySmile":[1,1],"bearDrowsySmile->bearSnuggle":[2,1],"bearSnuggle->bearSettleLoop":[3,1]};
