
/*
 * CSI model definition
 */

var modelConfCSI = {
    id: 1,
    name: "ARFP",    // meta-store (!) - sensor selection
    master: true,
    storename: "CSI",
    dataminerurl: "http://localhost:9789/enstream/push-sync-stores",
    callbackurl: "http://localhost:9788/modelling/",
    timestamp: "Time",
    type: {
        scheduled: "daily",
        startHour: 14
    },
    sensors: [

        /* sensor features */
        { name: "turin-building-CSI_BUILDING-buildingconsumptionnocooling", ts: [0, -24, -48], aggrs: ["ma6h", "ma1d", "ma1w", "ma1m", "min1d", "min1w", "max1d", "max1w", "var6h", "var1d", "var1w", "var1m"], type: "sensor" },
        /*
        { name: "turin-building-CSI_BUILDING-buildingcooling", ts: [0, -24, -48], aggrs: ["ma1d", "ma1w", "var1d"], type: "sensor" },
        { name: "turin-building-CSI_BUILDING-buildingtotalconsumption", ts: [0, -24, -48], aggrs: ["ma1d", "ma1w"], type: "sensor" },
        { name: "turin-building-CSI_BUILDING-datacentrecooling", ts: [0, -24, -48], aggrs: ["ma1d", "ma1w"], type: "sensor" },
        */
        /* weather */


        /* weather forecast */

        { name: "FIO-Turin-FIO-temperature", ts: [24], type: "prediction" },
        { name: "FIO-Turin-FIO-humidity", ts: [24], type: "prediction" },
        { name: "FIO-Turin-FIO-windSpeed", ts: [24], type: "prediction" },
        { name: "FIO-Turin-FIO-windBearing", ts: [24], type: "prediction" },
        { name: "FIO-Turin-FIO-cloudCover", ts: [24], type: "prediction" },

        /* static features */

        { name: "dayOfWeek", ts: [24], aggrs: [], type: "feature" },
        { name: "dayOfYear", ts: [24], aggrs: [], type: "feature" },
        { name: "monthOfYear", ts: [24], aggrs: [], type: "feature" },
        { name: "weekEnd", ts: [24], aggrs: [], type: "feature" },
        { name: "dayAfterHolidayTurin", ts: [24], aggrs: [], type: "feature" },
        { name: "holidayTurin", ts: [24], aggrs: ["sum1w"], type: "feature" },
        { name: "dayBeforeHolidayTurin", ts: [24], aggrs: [], type: "feature" },
        { name: "workingHoursTurin", ts: [24], aggrs: ["sum6h", "sum1w"], type: "feature" },
        { name: "heatingSeasonTurin", ts: [24], aggrs: [], type: "feature" }

    ],
    prediction: { name: "turin-building-CSI_BUILDING-buildingconsumptionnocooling", ts: 13 },
    method: "nn", // linreg, svmr, ridgereg, nn, ht, movavg
    paramsht: {
        // Hoeffding tree
        "gracePeriod": 2,
        "splitConfidence": 1e-2,
        "tieBreaking": 1e-4,
        "driftCheck": 1000,
        "windowSize": 100000,
        "conceptDriftP": true,
        "clsLeafModel": "naiveBayes",
        "clsAttrHeuristic": "giniGain",
        "maxNodes": 60,
        "attrDiscretization": "bst"
    },
    paramsmovavg: {
        // moving average
        window: 2
    },
    paramsnn: {
        // neural networks
        "layout": [-99, 10, 4, 3, 1], // -99 gets replaced by ftrSpace.dim        
        "tFuncHidden": "tanHyper",
        "tFuncOut": "linear",
        "learnRate": 0.017,
        "momentum": 0.5
    },
    paramssvmr: {
        params: {
            "c": 0.03,
            "eps": 0.02,
            "maxTime": 2,
            "maxIterations": 1E6,
            batchSize: 365
        },
        window: 365,
        learnskip: 365
    },
    normFactor: 250,
    normNum: 365,
    resampleint: 1 * 60 * 60 * 1000
};



/*
 * EPEX model definition
 */

var modelConfEPEX = {
    id: 1,
    name: "ALL",    // meta-store (!) - sensor selection
    master: true,
    storename: "EPEX",
    dataminerurl: "http://localhost:9789/enstream/push-sync-stores",
    callbackurl: "http://localhost:9788/modelling/",
    timestamp: "Time",
    type: {
        scheduled: "daily",
        startHour: 11
    },
    sensors: [

        /* sensor features */
        { name: "spot-ger-energy-price", ts: [0, -24, -48], aggrs: ["ma1w", "ma1m", "min1w", "max1w", "var1m"], type: "sensor" },
        { name: "spot-ger-total-energy", ts: [0, -24, -48], aggrs: ["ma1w", "ma1m", "min1w", "max1w", "var1m"], type: "sensor" },


        { name: "WU-Duesseldorf-WU-windspeed", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-Duesseldorf-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"], type: "sensor" },
        { name: "WU-Duesseldorf-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"], type: "sensor" },
        { name: "WU-Duesseldorf-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"], type: "sensor" },
        { name: "WU-Duesseldorf-WU-pressure", ts: [0], aggrs: ["ma1w"], type: "sensor" },

        { name: "WU-Wiesbaden-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"], type: "sensor" },
        { name: "WU-Wiesbaden-WU-windspeed", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-Wiesbaden-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"], type: "sensor" },
        { name: "WU-Wiesbaden-WU-pressure", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-Wiesbaden-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"], type: "sensor" },

        { name: "WU-Hanover-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"], type: "sensor" },
        { name: "WU-Hanover-WU-windspeed", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-Hanover-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"], type: "sensor" },
        { name: "WU-Hanover-WU-pressure", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-Hanover-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"], type: "sensor" },

        { name: "WU-Laage-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"], type: "sensor" },
        { name: "WU-Laage-WU-windspeed", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-Laage-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"], type: "sensor" },
        { name: "WU-Laage-WU-pressure", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-Laage-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"], type: "sensor" },

        { name: "WU-BerlinTegel-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"], type: "sensor" },
        { name: "WU-BerlinTegel-WU-windspeed", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-BerlinTegel-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"], type: "sensor" },
        { name: "WU-BerlinTegel-WU-pressure", ts: [0], aggrs: ["ma1w"], type: "sensor" },
        { name: "WU-BerlinTegel-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"], type: "sensor" },


        /* weather forecast */

        { name: "FIO-Berlin-FIO-temperature", ts: [24], type: "prediction" },
        { name: "FIO-Berlin-FIO-humidity", ts: [24], type: "prediction" },
        { name: "FIO-Berlin-FIO-windSpeed", ts: [24], type: "prediction" },
        { name: "FIO-Berlin-FIO-windBearing", ts: [24], type: "prediction" },
        { name: "FIO-Berlin-FIO-cloudCover", ts: [24], type: "prediction" },

        { name: "FIO-Laage-FIO-temperature", ts: [24], type: "prediction" },
        { name: "FIO-Laage-FIO-humidity", ts: [24], type: "prediction" },
        { name: "FIO-Laage-FIO-windSpeed", ts: [24], type: "prediction" },
        { name: "FIO-Laage-FIO-windBearing", ts: [24], type: "prediction" },
        { name: "FIO-Laage-FIO-cloudCover", ts: [24], type: "prediction" },

        { name: "FIO-Duesseldorf-FIO-temperature", ts: [24], type: "prediction" },
        { name: "FIO-Duesseldorf-FIO-humidity", ts: [24], type: "prediction" },
        { name: "FIO-Duesseldorf-FIO-windSpeed", ts: [24], type: "prediction" },
        { name: "FIO-Duesseldorf-FIO-windBearing", ts: [24], type: "prediction" },
        { name: "FIO-Duesseldorf-FIO-cloudCover", ts: [24], type: "prediction" },

        { name: "FIO-Hannover-FIO-temperature", ts: [24], type: "prediction" },
        { name: "FIO-Hannover-FIO-humidity", ts: [24], type: "prediction" },
        { name: "FIO-Hannover-FIO-windSpeed", ts: [24], type: "prediction" },
        { name: "FIO-Hannover-FIO-windBearing", ts: [24], type: "prediction" },
        { name: "FIO-Hannover-FIO-cloudCover", ts: [24], type: "prediction" },

        { name: "FIO-Kiel-FIO-temperature", ts: [24], type: "prediction" },
        { name: "FIO-Kiel-FIO-humidity", ts: [24], type: "prediction" },
        { name: "FIO-Kiel-FIO-windSpeed", ts: [24], type: "prediction" },
        { name: "FIO-Kiel-FIO-windBearing", ts: [24], type: "prediction" },
        { name: "FIO-Kiel-FIO-cloudCover", ts: [24], type: "prediction" },

        /* static features */

        { name: "dayAfterHolidayAachen", ts: [24], aggrs: [], type: "feature" },
        { name: "dayBeforeHolidayAachen", ts: [24], aggrs: [], type: "feature" },
        { name: "holidayAachen", ts: [24], aggrs: [], type: "feature" },
        { name: "dayOfWeek", ts: [24], aggrs: [], type: "feature" },
        { name: "dayOfYear", ts: [24], aggrs: [], type: "feature" },
        { name: "monthOfYear", ts: [24], aggrs: [], type: "feature" },
        { name: "weekEnd", ts: [24], aggrs: [], type: "feature" }

    ],
    prediction: { name: "spot-ger-energy-price", ts: 13 },
    method: "svmr", // linreg, svmr, ridgereg, nn, ht, movavg
    paramsht: {
        // Hoeffding tree
        "gracePeriod": 2,
        "splitConfidence": 3e-2,
        "tieBreaking": 1e-4,
        "driftCheck": 1000,
        "windowSize": 100000,
        "conceptDriftP": true,
        "clsLeafModel": "naiveBayes",
        "clsAttrHeuristic": "giniGain",
        "maxNodes": 60,
        "attrDiscretization": "bst"
    },
    paramsmovavg: {
        // moving average
        window: 30
    },
    paramsnn: {
        // neural networks
        "layout": [-99, 5, 1], // -99 gets replaced by ftrSpace.dim
        "tFuncIn": "linear",
        "tFuncHidden": "tanHyper",
        "tFuncOut": "linear",
        "learnRate": 0.2,
        "momentum": 0.5
    },
    paramssvmr: {
        params: {
            "c": 0.02,
            "eps": 0.04,
            "maxTime": 2,
            "maxIterations": 1E6,
            batchSize: 365
        },
        window: 365,
        learnskip: 365
    },
    normFactor: 200,
    normNum: 365,
    resampleint: 1 * 60 * 60 * 1000
};
