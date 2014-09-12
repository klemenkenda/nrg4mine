// ---------------------------------------------------------------------------
// FILE: modelling.js
// AUTHOR: Klemen Kenda (IJS)
// DATE: 2014-09-01
// DESCRIPTION:
//   JS part of the NRG4Cast QMiner - Modelling
// ---------------------------------------------------------------------------
// HISTORY:
// ---------------------------------------------------------------------------

// initialization
console.say("NRG4Cast Miner - Modelling", "Starting ...");

// includes
var tm = require("time");
var model = require("tsmodel.js");
var analytics = require("analytics.js");
var evaluation = require("evaluation.js");
var svmrModule = require("svmRegression.js");
require("config.js");

// definition of the model
modelConf = {
    id: 1,
    name: "EPEX00h",
    timestamp: "Time",
    sensors: [        
        
        { name: "Electricity-Price", ts: [0, -24, -48], aggrs: ["ma1w", "ma1m", "min1w", "max1w", "var1m"] },        
        { name: "Electricity-Quantity", ts: [0, -24, -48], aggrs: ["ma1w", "ma1m", "min1w", "max1w", "var1m"] },                

        { name: "WU-Duesseldorf-WU-windspeed", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-Duesseldorf-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"] },
        { name: "WU-Duesseldorf-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"] },        
        { name: "WU-Duesseldorf-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"] },
        { name: "WU-Duesseldorf-WU-pressure", ts: [0], aggrs: ["ma1w"] },
        
        { name: "WU-Wiesbaden-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"] },
        { name: "WU-Wiesbaden-WU-windspeed", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-Wiesbaden-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"] },
        { name: "WU-Wiesbaden-WU-pressure", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-Wiesbaden-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"] },
        
        { name: "WU-Hanover-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"] },
        { name: "WU-Hanover-WU-windspeed", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-Hanover-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"] },
        { name: "WU-Hanover-WU-pressure", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-Hanover-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"] },
        
        { name: "WU-Laage-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"] },
        { name: "WU-Laage-WU-windspeed", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-Laage-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"] },
        { name: "WU-Laage-WU-pressure", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-Laage-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"] },
        
        { name: "WU-BerlinTegel-WU-temperature", ts: [0], aggrs: ["ma1w", "min1w", "max1w", "var1m"] },
        { name: "WU-BerlinTegel-WU-windspeed", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-BerlinTegel-WU-humidity", ts: [0], aggrs: ["ma1w", "ma1m", "max1w", "var1w"] },
        { name: "WU-BerlinTegel-WU-pressure", ts: [0], aggrs: ["ma1w"] },
        { name: "WU-BerlinTegel-WU-cloudcover", ts: [0], aggrs: ["ma1w", "var1w"] }            
        
    ],
    prediction: { name: "Electricity-Price", ts: 24 },
    method: "linreg",
    params: {
        "gracePeriod": 2,
        "splitConfidence": 1e-4,
        "tieBreaking": 1e-14,
        "driftCheck": 1000,
        "windowSize": 100000,
        "conceptDriftP": true,
        "clsLeafModel": "naiveBayes",
        "clsAttrHeuristic": "giniGain",
        "maxNodes": 60,
        "attrDiscretization": "bst"
    },
    normFactor: 200,
    resampleint: 1 * 60 * 60 * 1000,
    lastTs: 0
};


// make the merger & resampler & corresponding stores
http.onGet("init", function (request, response) {    
    // init empty stores if no data is yet in ... 
    model.makeStores(modelConf);

    // get merger conf
    var mergerJSON = model.getMergerConf(modelConf);
    console.log(JSON.stringify(mergerJSON));   

    // get store conf
    var mergerStoreDef = model.getMergedStoreDef(mergerJSON, "");
    var mergerResampledStoreDef = model.getMergedStoreDef(mergerJSON, "R");

    // create out/resampled stores
    var mergedStore = qm.createStore([mergerStoreDef]);
    qm.createStore([mergerResampledStoreDef]);

    // create merger aggregate
    qm.newStreamAggr(mergerJSON);    

    // attach resampler to the merger
    var resampledAggrDef = model.getResampledAggrDef(mergerJSON, modelConf);
    mergedStore.addStreamAggr(resampledAggrDef);

    http.jsonp(request, response, resampledAggrDef);
});

http.onGet("load-model-data", function (request, response) {
    var url = model.getFetchURL(modelConf, "2010-01-01", "2011-01-01", 0);

    response.send(url);
});

http.onGet("evaluate", function (request, response) {
    // resample store start is at 3:00:00 + 6 is first noon
    // init modeling conditions
    var startoffset = 6 + 2 * 24;  // starting at noon 
    var offset = startoffset;

    // source store        
    var resampledStore = qm.store("R" + modelConf.name);

    // create feature space
    console.log("Create feature space");
    var fsConf = model.getFtrSpaceDef(modelConf);
    var ftrSpace = analytics.newFeatureSpace(fsConf);    
    console.log("FtrSp dim:" + ftrSpace.dim);

    var rec = model.getRecord(modelConf, resampledStore, offset);

    var htConf = model.getHtFtrSpaceDef(modelConf);

    // defining border between training set and test set
    var trainingThreshold = 2 * 365;

    // main loop for testing
    var N = 3 * 365 + 7 * 30;
    // N = 10;       

    // normalization - learning    
    console.log("Learning normalization parameters");
    for (i = 0; i < N; i++) {
        var rec = model.getRecord(modelConf, resampledStore, i * 24 + offset);
        ftrSpace = ftrSpace.updateRecord(rec);
    }       

    // initialize model
    
    // linear algebra
    console.log("Initialize linreg");
    // var linreg = analytics.newRecLinReg({ "dim": ftrSpace.dim, "forgetFact": 1.0 }); 
    var ridreg = new analytics.ridgeRegression(0.1, ftrSpace.dim, 2* 365);
    // var NN = analytics.newNN({ "layout": [ftrSpace.dim, 12, 4, 3, 1] });    
    // var svmR = svmrModule.newSvmRegression(ftrSpace.dim, { "c": 20, "eps": 1E-4, "maxTime": 60, "maxIterations": 1000000, batchSize: 365 }, 365);
    // var ht = analytics.newHoeffdingTree(htConf, modelConf.params);

    var prediction = -1;
    var str = "i;val;pred\n";

    var me = evaluation.newMeanError();
    var mae = evaluation.newMeanAbsoluteError();
    var mse = evaluation.newMeanSquareError();
    var rmse = evaluation.newRootMeanSquareError();
    var rsquare = evaluation.newRSquareScore();
    var pError;
    
    for (var i = 0; i < N; i++) {
        // create vector
        console.log("Get record");
        var rec = model.getRecord(modelConf, resampledStore, offset);
        console.log("Extract feature vector");
        var vec = ftrSpace.ftrVec(rec);        
        // printj(rec);
        // la.printFeatVec(vec, ftrSpace);
        console.log("Make prediction");
        // prediction = linreg.predict(vec);
        prediction = ridreg.predict(vec);
        // predictions = NN.predict(vec); prediction = predictions[0];
        // prediction = svmR.predict(vec);
        /*
        var vecArr = [];
        for (var rowN = 0; rowN < vec.length; rowN++) {
            vecArr.push(vec.at(rowN));
        }
        prediction = ht.predict([], vecArr);
        */

        // get value
        console.log("Get learn value");
        var value = model.getLearnValue(modelConf, resampledStore, offset);
        // NN - value normalization
        // value = value / modelConf.normFactor;
        // outVec = linalg.newVec([value]);
        // console.log("Value: " + value)

        // learn        
        console.log("Learn");
        // linreg.learn(vec, value);        
        ridreg.addupdate(vec, value);
        // NN.learn(vec, outVec);
        // learn every 30 samples
        /*
        if ((i % 365 != 0) && (i != 0)) svmR.add(vec, value);
        else {
            // la.printFeatVec(vec, ftrSpace);
            svmR.learn(vec, value);
        }
        */
        // ht.process([], vecArr, value);
        // NN renormalization
        value = value * modelConf.normFactor;
        prediction = prediction * modelConf.normFactor;

        console.log("Finish learning");
        // previous value model
        // var prediction = model.getLearnValue(modelConf, resampledStore, offset - 24);        

        // display results
        if (i > trainingThreshold) {
            me.update(value, prediction);
            mae.update(value, prediction);
            mse.update(value, prediction);
            rmse.update(value, prediction);
            rsquare.update(value, prediction);            
        }        
        
        diff = prediction - value;
        console.log(i + " - diff: " + diff);
        str += i + ";" + value + ";" + prediction + "\n";
        // move 1 day forward
        offset += 24;        
    }

    // ht.exportModel({ "file": "./sandbox/ht/epex.gv", "type": "DOT" });

    str = "me;mae;mse;rmse;rsquared\n" + me.getError() + ";" + mae.getError() + ";" + mse.getError() + ";" + rmse.getError() + ";" + rsquare.getError() + "\n\n\n" + str;
    
    str = str.replace(/\./g, ",");
    // create feature vector
    // http.jsonp(request, response, pError);
    response.send(str);

});






// get functions -------------------------------------------------------------

// ---------------------------------------------------------------------------
// FUNCTION: onGet - get-measurements
// DESCRIPTION: Get measurements.
// ---------------------------------------------------------------------------
http.onGet("get-measurement", function (request, response) {
    var sensorname = request.args.name[0];
    var startDateStr = request.args.startdate[0];
    var endDateStr = request.args.enddate[0];

    console.log(sensorname);

    var measurementStoreStr = "M" + nameFriendly(String(sensorname));
    
    // add dummy date
    addDate(startDateStr, endDateStr);

    // get measurements
    var measuredRSet = qm.search({
        "$from": measurementStoreStr,
        "Date": [{ "$gt": String(startDateStr) }, { "$lt": String(endDateStr) }]
    });

    // console.log(objToString(measuredRSet));
    console.log(String(startDateStr) + String(endDateStr));

    // sort measurements
    // measuredRSet.sort(function (rec1, rec2) { return rec1.Time < rec2.Time; });

    str = "[\n";
    for (var i = 0; i < measuredRSet.length; i++) {
        str += '  { "Val":' + measuredRSet[i].Val + ', "Timestamp": "' + measuredRSet[i].Time.string + '"}';
        if (i != measuredRSet.length - 1) str += ',\n';
    }
    str += "\n]";
    
    response.send(str);
});

// ---------------------------------------------------------------------------
// FUNCTION: onGet - get-aggregates
// DESCRIPTION: Get all aggregates
// ---------------------------------------------------------------------------
http.onGet("get-aggregates", function (request, response) {    
    var sensorname = request.args.name;
    var startDateStr = request.args.startdate;
    var endDateStr = request.args.enddate;

    console.log(sensorname);
    console.say(sensorname + startDateStr + endDateStr);

    var measurementStoreStr = "A" + nameFriendly(String(sensorname));

    // add dummy date
    addDate(startDateStr, endDateStr);

    // get measurements
    var measuredRSet = qm.search({
        "$from": measurementStoreStr,
        "Date": [{ "$gt": String(startDateStr) }, { "$lt": String(endDateStr) }]
    });

    // sort measurements
    // measuredRSet.sort(function (rec1, rec2) { return rec1.Time < rec2.Time; });

    http.jsonp(request, response, measuredRSet);
});

// add functions -------------------------------------------------------------

// ---------------------------------------------------------------------------
// FUNCTION: onGet - add-measurement
// DESCRIPTION: Add measurement from middle layer (JSON) - GET wrapper
// ---------------------------------------------------------------------------
http.onGet("add-measurement", function (request, response) {
    // parse string parameter to JSON    
    var data = JSON.parse(request.args.data);
    // add the measurement
    var str = addMeasurement(data);
    // TODO: add to journal    
    response.send(str);
});

// ---------------------------------------------------------------------------
// FUNCTION: onPost - add-measurement
// DESCRIPTION: Add measurement from middle layer (JSON) - POST wrapper used
//              for larger chunks of JSON that do not fit into GET request
// ---------------------------------------------------------------------------
http.onPost("add-measurement", function (request, response) {
    // parse string parameter to JSON    
    var data = JSON.parse(request.args.data);
    // add the measurement
    var str = addMeasurement(data);
    // TODO: add to journal    
    response.send(str);
});

// ---------------------------------------------------------------------------
// FUNCTION: addMeasurement
// DESCRIPTION: Implementation of add measurement.
// ---------------------------------------------------------------------------
function addMeasurement(data) {
    // init str
    var str = "";

    // parse all the records in the JSON 
    for (i = 0; i < data.length; i++) {
        // parse node	
        var node = new Object();
        node.Name = data[i].node.name;
        node.Position = new Array();
        node.Position[0] = data[i].node.lat;
        node.Position[1] = data[i].node.lng;
        // write node to the store				
        var nodeid = qm.store("Node").add(node);

        // parse measurements
        var measurements = data[i].node.measurements;


        for (j = 0; j < measurements.length; j++) {
            // parse type
            var type = new Object();
            type.Name = measurements[j].type.name;
            type.Phenomena = measurements[j].type.phenomenon;
            type.UoM = measurements[j].type.UoM;
            // write type to the store
            var typeid = qm.store("Type").add(type);

            // parse sensor
            var sensor = new Object();
            sensor.Name = measurements[j].sensorid;
            sensor.NodeId = nodeid;
            sensor.TypeId = typeid;
            // write sensor to the store
            var sensorid = qm.store("Sensor").add(sensor);

            var measurementStoreStr = "M" + nameFriendly(sensor.Name);
            var aggregateStoreStr = "A" + nameFriendly(sensor.Name);
            var resampledStoreStr = "R" + nameFriendly(sensor.Name);

            var measurementStore = qm.store(measurementStoreStr);

            // if the store does not exits
            if (measurementStore == null) {
                // M-sensorname --> measurements
                qm.createStore([{
                    "name": measurementStoreStr,
                    "fields": [
                        { "name": "Time", "type": "datetime" },
                        { "name": "Date", "type": "string" },
                        { "name": "Val", "type": "float" }
                    ],
                    "joins": [],
                    "keys": [
                        { "field": "Date", "type": "value", "sort": "string", "vocabulary": "date_vocabulary" }
                    ]
                }]);
                       
                // A-sensorname --> aggregates
                var aggregateStoreDef = getAggregateStoreStructure(aggregateStoreStr);
                qm.createStore([aggregateStoreDef]);

                measurementStore = qm.store(measurementStoreStr);                
                
                // creating tick
                measurementStore.addStreamAggr({
                    name: "tick", type: "timeSeriesTick",
                    timestamp: "Time", value: "Val"
                })                                                  

                // adding tick-base aggregates
                tickTimes.forEach(function (time) {
                    tickAggregates.forEach(function (aggregate) {
                        aggregateObj = {
                            name: aggregate.name + time.name, type: aggregate.type, inAggr: "tick",
                            emaType: "previous", interval: time.interval * 60 * 60 * 1000 - 1, initWindow: 0 * 60 * 1000
                        };
                        measurementStore.addStreamAggr(aggregateObj);                        
                    })
                });

                // adding tick-base aggregates
                bufTimes.forEach(function (time) {
                    var bufname = 'winbuff' + time.name;
                    // adding timeserieswinbuff aggregate
                    measurementStore.addStreamAggr({
                        name: bufname, type: "timeSeriesWinBuf",
                        timestamp: "Time", value: "Val", winsize: time.interval * 60 * 60 * 1000 - 1
                    });

                    bufAggregates.forEach(function (aggregate) {
                        aggregateObj = {
                            name: aggregate.name + time.name, type: aggregate.type, inAggr: bufname                            
                        };
                        measurementStore.addStreamAggr(aggregateObj);                        
                    })
                });

                /*
                // TODO: create accompanying stores (resample and aggregates) - to be confirmed
                // A-sensorname --> aggregates
                */
            }

            // parse measurement
            var measurement = new Object();
            measurement.Val = measurements[j].value;
            measurement.Timestamp = measurements[j].timestamp;
            measurement.Date = measurement.Timestamp.substr(0, 10);

            // check if the measurement is old
            if ((measurementStore.length < 1) || (measurement.Timestamp > measurementStore[measurementStore.length - 1].Time.string)) {

                str += measurement.Timestamp + "#Type=" + typeid + "\n";;


                var measurementJSON = '{ "Val": ' + measurement.Val + ', "Time": "' + measurement.Timestamp + '", "Date": "' + measurement.Date + '"}';
                console.log("Added", measurementStoreStr);

                try {
                    var measurementObj = JSON.parse(measurementJSON);
                    // write measurement to the store
                    var measurementid = measurementStore.add(measurementObj);

                    // TODO: save aggregates to the store
                    var aggregateStore = qm.store(aggregateStoreStr);
                    var aggregateid = aggregateStore.add(getCurrentAggregates(measurementStore));
                } catch (e) {
                    console.say("Parsing error: " + e);
                }
            } else {
                // trigger an alarm - wrong timestamp
                str += "Wrong timestamp!";
                console.say("Wrong timestamp - last = " + measurementStore[measurementStore.length - 1].Time.string + "; measurement = " + measurement.Timestamp);
            }
        }
    }
    return str;
}

function addMeasurementNoControl(data) {
    // init str
    var str = "";

    // parse all the records in the JSON 
    for (i = 0; i < data.length; i++) {
        // parse node	
        var node = new Object();
        node.Name = data[i].node.name;
        node.Position = new Array();
        node.Position[0] = data[i].node.lat;
        node.Position[1] = data[i].node.lng;
        // write node to the store				
        var nodeid = qm.store("Node").add(node);

        // parse measurements
        var measurements = data[i].node.measurements;


        for (j = 0; j < measurements.length; j++) {
            // parse type
            var type = new Object();
            type.Name = measurements[j].type.name;
            type.Phenomena = measurements[j].type.phenomenon;
            type.UoM = measurements[j].type.UoM;
            // write type to the store
            var typeid = qm.store("Type").add(type);

            // parse sensor
            var sensor = new Object();
            sensor.Name = measurements[j].sensorid;
            sensor.NodeId = nodeid;
            sensor.TypeId = typeid;
            // write sensor to the store
            var sensorid = qm.store("Sensor").add(sensor);

            var measurementStoreStr = "M" + nameFriendly(sensor.Name);
            var aggregateStoreStr = "A" + nameFriendly(sensor.Name);
            var resampledStoreStr = "R" + nameFriendly(sensor.Name);

            var measurementStore = qm.store(measurementStoreStr);

            // if the store does not exits
            if (measurementStore == null) {
                // M-sensorname --> measurements
                qm.createStore([{
                    "name": measurementStoreStr,
                    "fields": [
                        { "name": "Time", "type": "datetime" },
                        { "name": "Date", "type": "string" },
                        { "name": "Val", "type": "float" }
                    ],
                    "joins": [],
                    "keys": [
                        { "field": "Date", "type": "value", "sort": "string", "vocabulary": "date_vocabulary" }
                    ]
                }]);
            }

            // parse measurement
            var measurement = new Object();
            measurement.Val = measurements[j].value;
            measurement.Timestamp = measurements[j].timestamp;
            measurement.Date = measurement.Timestamp.substr(0, 10);

            // check if the measurement is old
            
            str += measurement.Timestamp + "#Type=" + typeid + "\n";;


            var measurementJSON = '{ "Val": ' + measurement.Val + ', "Time": "' + measurement.Timestamp + '", "Date": "' + measurement.Date + '"}';
            console.log("Added", measurementStoreStr);

            try {
                var measurementObj = JSON.parse(measurementJSON);
                // write measurement to the store
                var measurementid = measurementStore.add(measurementObj);

                // TODO: save aggregates to the store
                // var aggregateStore = qm.store(aggregateStoreStr);
                // var aggregateid = aggregateStore.add(getCurrentAggregates(measurementStore));
            } catch (e) {
                console.say("Parsing error: " + e);
            } 
        }
    }
    return str;
}

// ---------------------------------------------------------------------------
// FUNCTION: onGet - get-aggregate-store-structure
// DESCRIPTION: Get aggregate store structure
// ---------------------------------------------------------------------------
http.onGet("get-aggregate-store-structure", function(req, response) {
    var aggregateStoreStr = "A" + nameFriendly(req.args.sid[0]);
    var data = getAggregateStoreStructure(aggregateStoreStr);    
    http.jsonp(req, response, data);
});

function getAggregateStoreStructure(aggregateStoreStr) {
    
    var data = {
        "name": aggregateStoreStr,
        "fields": [
            { "name": "Time", "type": "datetime" },
            { "name": "Date", "type": "string" }           
        ],
        "joins": [],
        "keys": [
            { "field": "Date", "type": "value", "sort": "string", "vocabulary": "date_vocabulary" }
        ]
    };

    // adding tick-base aggregates
    tickTimes.forEach(function (time) {
        tickAggregates.forEach(function (aggregate) {
            aggrname = aggregate.name + time.name;
            data["fields"].push({ "name": aggrname, "type": "float"});
        })
    });    

    // adding tick-base aggregates
    bufTimes.forEach(function (time) {
        bufAggregates.forEach(function (aggregate) {
            aggrname = aggregate.name + time.name;
            data["fields"].push({ "name": aggrname, "type": "float"});
        })
    });

    return data;
};

// help functions -----------------------------------------------------------

// ---------------------------------------------------------------------------
// FUNCTION: objToString
// DESCRIPTION: Convert object to string for debugging
// ---------------------------------------------------------------------------
function objToString(obj) {
    var str = '';
    for (var p in obj) {
        if (obj.hasOwnProperty(p)) {
            str += p + '::' + obj[p] + '\n';
        }
    }
    return str;
}


// ---------------------------------------------------------------------------
// FUNCTION: displayRecords
// DESCRIPTION: Display an array of records.
// ---------------------------------------------------------------------------
function displayObject(recs) {
    var str = "";

    if (recs.empty) str = "No records ...";

    for (var i = 0; i < recs.length; i++) {
        str += objToString(recs[i]);
        str += "\n";
    }
    return str;
}


// ---------------------------------------------------------------------------
// FUNCTION: lZ
// DESCRIPTION: Leading zero for length 2
// ---------------------------------------------------------------------------
function lZ(myStr) {
    outStr = myStr;
    if (myStr.length == 1) {
        outStr = "0" + myStr;
    }
    return outStr;
}

// ---------------------------------------------------------------------------
// FUNCTION: mysqlDateStr
// DESCRIPTION: Convert JS date to MySQL date
// ---------------------------------------------------------------------------
function mysqlDateStr(myDate) {
    return myDate.getFullYear() + "-" + lZ((myDate.getMonth() + 1) + "") + "-" + lZ(myDate.getDate() + "");
}

// ---------------------------------------------------------------------------
// FUNCTION: nameFriendly
// DESCRIPTION: Returns store name friendly name; only use alphanumeric
//              characters.
// ---------------------------------------------------------------------------
function nameFriendly(myName) {
    return myName.replace(/\W/g, '');
}

// ---------------------------------------------------------------------------
// FUNCTION: onGet - add
// DESCRIPTION: Generic store add function
// ---------------------------------------------------------------------------
http.onGet("add", function (request, response) {
    var storeStr = String(request.args.store);
    var store = qm.store(storeStr);

    // if the store does not exits
    if (store == null) {
        // M-sensorname --> measurements
        if (storeStr.substr(0, 1) == "M") {
            store = qm.createStore([{
                "name": storeStr,
                "fields": [
                    { "name": "Time", "type": "datetime" },
                    { "name": "Date", "type": "string" },
                    { "name": "Val", "type": "float" }
                ],
                "joins": [],
                "keys": [
                    { "field": "Date", "type": "value", "sort": "string", "vocabulary": "date_vocabulary" }
                ]
            }]);
        } else if (storeStr.substr(0, 1) == "A") {
            var aggregateStoreDef = getAggregateStoreStructure(storeStr);
            store = qm.createStore([aggregateStoreDef]);
        }
    };
    store.add(JSON.parse(request.args.data));
    response.send("OK");
});

// ---------------------------------------------------------------------------
// FUNCTION: onGet - records
// DESCRIPTION: Generic store retrieve records function
// ---------------------------------------------------------------------------
http.onGet("records", function (request, response) {
    var recs = qm.store(String(request.args.store)).recs;
    var str = "";

    if (recs.empty) str = "No records ...";

    for (var i = 0; i < recs.length; i++) {
        str += objToString(recs[i]);
        str += "\n";
    }
    response.send(str);
});
