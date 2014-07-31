// ---------------------------------------------------------------------------
// FILE: enstream.js
// AUTHOR: Klemen Kenda (IJS)
// DATE: 2013-06-01
// DESCRIPTION:
//   JS part of the NRG4Cast QMiner
// ---------------------------------------------------------------------------
// HISTORY:
//   2014-06-01: Rewritten for the open-source QMiner. (Klemen Kenda)
//   2014-06-01: Changed database schema (dynamic stores - per sensor)
//               (Klemen Kenda)
// ---------------------------------------------------------------------------

// initialization
console.say("NRG4Cast Miner", "Starting ...");

// includes
// var assert = require("assert.js");
var tm = require("time");

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
    { name: "avg", type: "ma" }
]


// get functions -------------------------------------------------------------

// ---------------------------------------------------------------------------
// FUNCTION: onRequest - get-nodes
// DESCRIPTION: Get nodes.
// ---------------------------------------------------------------------------
http.onGet("get-nodes", function (request, response) {
    var str;
    var recSet = qm.store("Node").recs;
	
    str = "[\n";
    for(var i = 0; i < recSet.length; i++) {
        str += '  {\n';
        str += '    "Name": "' + recSet[i].Name + '",\n';
        str += '    "Position": [' + recSet[i].Position + '],\n';


        // TODO: optimize indexing (!)
        str += '    "Sensors": [\n';

        var recSSet = qm.store("Sensor");

        var recTSet = qm.store("Type");

        jj = 0;
        for (var j = 0; j < recSSet.length; j++) {
            if (recSSet[j].NodeId == i) {
                jj++;
                if (jj != 1) str += ',\n';
                str += '      {\n';
                str += '        "Name":"' +  recSSet[j].Name + '",\n';
                str += '        "Phenomenon":"' + recTSet[recSSet[j].TypeId].Phenomena + '",\n';
                str += '        "UoM":"' + recTSet[recSSet[j].TypeId].UoM + '"\n';
                str += '      }';
            }
        }

        str += '\n    ]\n'

        str += '  }';
        if (i != recSet.length - 1) str += ',\n';
    }
    str += "\n]";
	
    response.send(str);
});



// ---------------------------------------------------------------------------
// FUNCTION: onGet - get-measurements
// DESCRIPTION: Get measurements.
// ---------------------------------------------------------------------------
http.onGet("get-measurement", function (request, response) {
    var sensorname = request.args.name;
    var startDateStr = request.args.startdate;
    var endDateStr = request.args.enddate;

    console.log(sensorname);

    var measurementStoreStr = "M" + nameFriendly(String(sensorname));

    // enter dummy sensor measurement (to insert date into a common key vocabulary)
    var startDateRequest = '[{"node":{"id":"virtual-node","name":"virtual-node","lat":0,"lng":0, \
        "measurements":[{"sensorid":"virtual-node-request","value":1.0,"timestamp":"' + startDateStr +
        'T00:00:00.000","type":{"id":"0","name":"virtual-request","phenomenon":"request","UoM":"r"}}]}}]';
    var endDateRequest = '[{"node":{"id":"virtual-node","name":"virtual-node","lat":0,"lng":0, \
        "measurements":[{"sensorid":"virtual-node-request","value":1.0,"timestamp":"' + endDateStr +
        'T00:00:00.000","type":{"id":"0","name":"virtual-request","phenomenon":"request","UoM":"r"}}]}}]';
    addMeasurement(JSON.parse(startDateRequest));
    addMeasurement(JSON.parse(endDateRequest));

    // get measurements
    var measuredRSet = qm.search({
        "$from": measurementStoreStr,
        "Date": [{ "$gt": String(startDateStr) }, { "$lt": String(endDateStr) }]
    });

    // sort measurements
    measuredRSet.sort(function (rec1, rec2) { return rec1.Time < rec2.Time; });

    str = "[\n";
    for (var i = 0; i < measuredRSet.length; i++) {
        str += '  { "Val":' + measuredRSet[i].Val + ', "Timestamp": "' + measuredRSet[i].Time.string + '"}';
        if (i != measuredRSet.length - 1) str += ',\n';
    }
    str += "\n]";
    
    response.send(str);
});



// data cleaning functions ---------------------------------------------------

// ---------------------------------------------------------------------------
// FUNCTION: onGet - get-cleaning-sample
// DESCRIPTION: Get measurements of a sensor for cleaning.
// ---------------------------------------------------------------------------
http.onGet("get-cleaning-sample", function (request, response) {
    // identify sensor/measurement store
    var sensorname = request.args.sensorid;
    var measurementStoreStr = "M" + nameFriendly(String(sensorname));
    // get records
    var measuredRSet = qm.store(measurementStoreStr);

    // leave a maximum of 500 measurements
    samplelength = measuredRSet.length;
    if (samplelength > 500) samplelength = 500;

    // create CSV response
    str = "";
    for (var i = 0; i < samplelength; i++) {
        str += measuredRSet[i].Time.string + ";" + measuredRSet[i].Val;
        str += '\n';
    }

    response.send(str);
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
                qm.createStore([{
                    "name": aggregateStoreStr,
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
                            emaType: "previous", interval: time.interval * 60 * 60 * 1000, initWindow: 0 * 60 * 1000
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
                        timestamp: "Time", value: "Val", winsize: time.interval * 60 * 60 * 1000
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

                    // DEBUG - display some aggregates                    
                    var tick = measurementStore.getStreamAggr("tick").GenericTick;
                    var lastval1h = measurementStore.getStreamAggr("winbuff1h").LastVal;
                    var ema1h = measurementStore.getStreamAggr("ema1h").EMA;
                    var var1h = measurementStore.getStreamAggr("var1h").VAR;
                    var avg1h = measurementStore.getStreamAggr("avg1h").MA;
                    var count1h = measurementStore.getStreamAggr("count1h").COUNT;
                    var sum1h = measurementStore.getStreamAggr("sum1h").SUM;
                    var min1h = measurementStore.getStreamAggr("min1h").MIN;
                    var max1h = measurementStore.getStreamAggr("max1h").MAX;


                    console.say("tick: " + tick + ", EMA: " + ema1h + ", VAR: " + var1h + ", MA: " + avg1h + ", CNT: " + count1h + ", SUM: " + sum1h + ", MIN: " + min1h + ", MAX: " + max1h);
                    // TODO: save aggregates to the store
                    
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

// ---------------------------------------------------------------------------
// FUNCTION: onGet - get-current-aggregates
// DESCRIPTION: Get current aggregates for sensor
// ---------------------------------------------------------------------------
http.onGet("get-current-aggregates", function (req, response) {    
    var measurementStoreStr = "M" + nameFriendly(req.args.sid[0]);

    var measurementStore = qm.store(measurementStoreStr);
    var strArr;

    var data = {};

    
    data["ema15m"] = measurementStore.getStreamAggr("ema15m").EMA;
    data["ema1h"] = measurementStore.getStreamAggr("ema1h").EMA;
    data["ema6h"] = measurementStore.getStreamAggr("ema6h").EMA;
    data["ema1d"] = measurementStore.getStreamAggr("ema1d").EMA;
    data["ema1w"] = measurementStore.getStreamAggr("ema1w").EMA;
    data["ema1m"] = measurementStore.getStreamAggr("ema1m").EMA;
    data["ema1y"] = measurementStore.getStreamAggr("ema1y").EMA;
    

    /*
    var data = {
        "ema15m": measurementStore.getStreamAggr("ema15m").EMA,
        "ema1h": measurementStore.getStreamAggr("ema1h").EMA
    };
    */

    // data = strArr;

    http.jsonp(req, response, data);
});


// generic functions ---------------------------------------------------------

// ---------------------------------------------------------------------------
// FUNCTION: onGet - add
// DESCRIPTION: Generic store add function
// ---------------------------------------------------------------------------
http.onGet("add", function (rec, response) {
    qm.store(rec.store).add(JSON.parse(rec.data));
    response.send("OK");
});

// ---------------------------------------------------------------------------
// FUNCTION: onGet - records
// DESCRIPTION: Generic store retrieve records function
// ---------------------------------------------------------------------------
http.onGet("records", function (query, response) {
    var recs = qm.store(query.store).recs;
    var str = "";

    if (recs.empty) str = "No records ...";

    for (var i = 0; i < recs.length; i++) {
        str += objToString(recs[i]);
        str += "\n";
    }
    response.send(str);
});


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
