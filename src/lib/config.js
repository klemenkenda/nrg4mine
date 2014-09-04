// config tick aggregates
tickTimes = [
    { name: "1h", interval: 1 },
    { name: "6h", interval: 6 },
    { name: "1d", interval: 24 },
    { name: "1w", interval: 7 * 24 },
    { name: "1m", interval: 30 * 24 },
    { name: "1y", interval: 365 * 24 }
];

tickAggregates = [
    { name: "ema", type: "ema" }
];

// config winbuff aggregates
bufTimes = [
    { name: "1h", interval: 1 },
    { name: "6h", interval: 6 },
    { name: "1d", interval: 24 },
    { name: "1w", interval: 7 * 24 },
    { name: "1m", interval: 30 * 24 },
    { name: "1y", interval: 365 * 24 }
]

bufAggregates = [
    { name: "count", type: "winBufCount" },
    { name: "sum", type: "winBufSum" },
    { name: "min", type: "winBufMin" },
    { name: "max", type: "winBufMax" },
    { name: "var", type: "variance" },
    { name: "ma", type: "ma" }
]

// remote modelling instance of QMiner - add function
remoteURL = "http://localhost:9888/modelling/add";