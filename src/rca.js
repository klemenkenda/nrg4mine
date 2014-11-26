// ---------------------------------------------------------------------------
// FILE: rca.js
// AUTHOR: Klemen Kenda (IJS)
// DATE: 2014-10-01
// DESCRIPTION:
//   JS part of the NRG4Cast QMiner - Root Cause Analysis
// ---------------------------------------------------------------------------
// HISTORY:
// ---------------------------------------------------------------------------

// initialization
console.say("NRG4Cast Miner - RCA", "Starting ...");

// includes
var tm = require("time");
var model = require("tsmodel.js");
var analytics = require("analytics.js");
var evaluation = require("evaluation.js");
var svmrModule = require("svmRegression.js");
var baselinePredictors = require("baselinePredictors.js");
var viz = require('visualization.js');
require("config.js");

var modelConf = {
    id: 1,
    modelid: "rca-special",
    name: "SPECIAL",    // meta-store (!) - sensor selection
    master: true,
    storename: "EPEX",
    dataminerurl: "http://localhost:9789/enstream/push-sync-stores",
    callbackurl: "http://localhost:9688/rca/",
    timestamp: "Time",
    sensors: [


        /* sensor features */
        { name: "spot-ger-energy-price", ts: [0], aggrs: [], type: "sensor" },
        { name: "spot-ger-total-energy", ts: [0], aggrs: [], type: "sensor" },

        /* static features */
        { name: "holidayAachen", ts: [24], aggrs: [], type: "feature" },
        { name: "dayOfWeek", ts: [24], aggrs: [], type: "feature" },
        { name: "dayOfYear", ts: [24], aggrs: [], type: "feature" },
        { name: "monthOfYear", ts: [24], aggrs: [], type: "feature" },
        { name: "weekEnd", ts: [24], aggrs: [], type: "feature" }

    ],    
    normFactor: 250,
    normNum: 365,
    resampleint: 1 * 60 * 60 * 1000,
    step: 1
};

// create model
modelRCA = new model.TSModel(modelConf);

// make the merger & resampler & corresponding stores
http.onGet("init", function (request, response) {    
    modelRCA.initialize();    

    http.jsonp(request, response, "OK");
});

http.onGet("update-data", function (request, response) {
    // use modelCSI[0].updateTimeStamps();
    var url = modelRCA.loadData(1000);

    response.send(url);
});

http.onGet("initial-load", function (request, response) {
    var url = modelRCA.loadData(100000000);
    response.send(url);
});

http.onGet("update-timestamps", function (request, response) {
    var response = modelRCA.updateTimestamps();

    response.send("OK");
});

http.onGet("evaluate", function (request, response) {
    goldenrule(runModel, 0.00001, 5, 0.001, 200);
});

function goldenrule(func, min, max, tol, nmax) {
    var n = 1;
    var amse = runModel([min]);
    var bmse = runModel([max]);

    var a = min;
    var b = max;

    var phi = (1 + Math.sqrt(5)) / 2; // golden ratio

    while ((n < nmax) && (((b - a) / 2) > tol)) {
        x1 = b - (b - a) / phi;
        x2 = a + (b - a) / phi;
        console.log("x1 = " + x1 + ";x2 = " + x2);

        x1mse = func([x1]);
        x2mse = func([x2]);

        if (x1mse > x2mse) {
            a = x1;
        } else {
            b = x2;
        }
    }

    console.log("a = " + a + "; b = " + b);
    console.log("Estimated minimizer: " + (a + b) / 2);
}



http.onGet("run", function(request, response) {       
    buffer = runModelOffline(modelRCA, [0]);
    http.jsonp(request, response, viz.highchartsTSConverter(buffer));
});

function runModelOffline(modelRCA, parameters) {
    // initialize offsets
    var offset = 2000;
    var oldOffset = -1;
    
    var learnEndOffset = 3.3 * 365 * 24;
    // learnEndOffset = 400;  // fast finish for debugging


    // source stores        
    console.log("Linking source data stores ...")
    modelRCA.updateStoreHandlers();
    modelRCA.createMetaStore();
    // modelRCA.addProcessStateAggr();

    console.log(modelRCA.metaMergedStore.name);

    // create feature space    
    console.log("Create feature space ...");
    modelRCA.initFtrSpace();                
        
    // initialize models
    console.log("Initialize model");
    modelRCA.initModel();    
      
    // repeat until OK
    while ((offset != oldOffset) && (offset < learnEndOffset)) {
        
        // get record for the current offset
        // the function automatically inserts record into the meta-merged store
        // which triggers the aggregate
        var rec = modelRCA.getRecord(offset);

        if (offset == 5000) modelRCA.addProcessStateAggr();

        if ((offset > 5000) && (offset % 100 == 0)) {
            fout = fs.openWrite("results-" + modelRCA.conf.name + ".json");
            str = modelRCA.psAggr.toJSON();
            fout.write(JSON.stringify(str));
            fout.close();
        }

        // modelRCA.createFtrVec();       

        // calculate new offset
        oldOffset = offset;
        offset++;
    }
    
   
    fout = fs.openWrite("results-" + modelRCA.conf.name + ".json");
    str = modelRCA.psAggr.toJSON();
    fout.write(JSON.stringify(str));
    fout.close();

    return "done";
}

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

    var record = JSON.parse(request.args.data);
    var responseStr;

    if ((store.empty) || (record.Time > store.last.Time.string)) {
        store.add(record);
        responseStr = "OK";
        console.log(responseStr);
    } else {
        responseStr = "Time problem: " + record.Time + " - store time: " + store.last.Time.string;
        console.log(responseStr);
    }
    response.send(responseStr);
});

// ---------------------------------------------------------------------------
// FUNCTION: onGet - update
// DESCRIPTION: Generic store update function
// ---------------------------------------------------------------------------
http.onGet("update", function (request, response) {

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

    var record = JSON.parse(request.args.data);
    var responseStr;

    // check if the measurement is new
    if ((store.empty) || (record.Time > store.last.Time.string)) {
        store.add(record);
        responseStr = "OK";
    } else {
        // else make an overwrite
        responseStr = "Overwrite.";        
        var i = 0;
        var offset = 1;
        // extract record time
        recTm = tm.parse(record.Time);
        currTm = store.last.Time;

        var updated = false;
        while ((i < 1000) && (updated == false) && (store.length - i > 0)) {
            i++;
            // get predicted offset - only working for hourly prediction granularity
            offset += Math.round((currTm.timestamp - recTm.timestamp) / 3600);
            if (offset < 1) offset = 1;

            console.log("I: " + offset + ", " + i);
            console.log("R: " + record.Time + ", S: " + store[store.length - offset].Time.string);
            if (store[store.length - offset].Time.string.substr(0, 19) == record.Time.substr(0, 19)) {
                store[store.length - offset].Val = record.Val;
                console.say("Value updated at " + store[store.length - offset].Time.string + " with " + record.Val);
                updated = true;
            }
            currTm = store[store.length - offset].Time;
        }
        if (updated == false) {
            console.say("Error - could not find/reach measurement to update!" + store[store.length - 1].Time.string + "; measurement = " + record.Time);
            responseStr += ("Could not find/reach measurement to update!\n");
        }
    }

    response.send(responseStr);
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



// RUN
// runModelsOffline(modelEPEX, [0]);
