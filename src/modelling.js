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
var baselinePredictors = require("baselinePredictors.js");
var viz = require('visualization.js');
require("config.js");


var modelConf = {
    id: 1,
    modelid: "svmr-arfp",
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
    method: "svmr", // linreg, svmr, ridgereg, nn, ht, movavg
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
            "c": 0.02,
            "eps": 0.015,
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


/* PREPARE ALL THE MODELS */
console.log("Preparing 24 EPEX models ...");
var modelEPEX = [];
for (var i = 0; i < 24; i++) {    
    modelEPEX[i] = new model.TSModel(prepareModel(modelConf, 13 + i));        
}

// evaluation structure
EvalStructure = function () {
    this.me;
    this.mae;
    this.mse;
    this.rmse;
    this.r2;

    this.init = function() {
        this.me = evaluation.newMeanError();
        this.mae = evaluation.newMeanAbsoluteError();
        this.mse = evaluation.newMeanSquareError();
        this.rmse = evaluation.newRootMeanSquareError();
        this.r2 = evaluation.newRSquareScore();
    }

    this.update = function (trueval, prediction) {
        this.me.update(trueval, prediction);
        this.mae.update(trueval, prediction);
        this.mse.update(trueval, prediction);
        this.rmse.update(trueval, prediction);
        this.r2.update(trueval, prediction);
    }

    this.init();
}

// general model evaluation
console.log("Creating evaluation structures ...");
var modelEvals = [];
for (var i = 0; i < 24; i++) {
    modelEvals[i] = new EvalStructure();
}

// general model evaluation
modelEval = new EvalStructure();

function prepareModel(modelConf, x) {
    // cloning objects in JS is ... painfully ugly
    var conf = JSON.parse(JSON.stringify(modelConf));
    conf.prediction.ts = x;
    conf.master = false;

    for (var i = 0; i < conf.sensors.length; i++) {
        if ((conf.sensors[i].type == "prediction") || (conf.sensors[i].type == "feature")) {
            conf.sensors[i].ts[0] = x;
        }
        // shifting times of sensor values        
        if (conf.sensors[i].type == "sensor") {
            for (var j = 0; j < conf.sensors[i].ts.length; j++) {
                var myoffset = x - 24;
                if (myoffset >= 0) myoffset -= 24;
                conf.sensors[i].ts[j] = (myoffset) + conf.sensors[i].ts[j];
            }
        }
    }

    return conf;
}

// pushing predictions to Monitoring DB
function successCallback (objJSON) {
    console.say("* Push prediction success ...");
    console.say(objJSON);
}

function errorCallback(message) {
    console.say("* Push prediction *****FAIL****** ...");
    console.say(message);
}


PPusher = function () {
    this.JSON = [];
    this.url = "http://83.212.123.209:8085/AggregateService/services/prediction-api/push-predictions?store=";

    this.add = function (es, prediction, sid, mid, timestamp) {
        var record = {
            "me": es.me.getError(), "mae": es.mae.getError(), "mse": es.mse.getError(),
            "rmse": es.rmse.getError(), "rsquared": es.r2.getError(), "value": prediction,
            "sensorId": sid, "modelId": mid, "timestamp": timestamp
        };
        this.JSON.push(record);
    }

    this.push = function () {
        console.log("Predictions pushed ...");
        // making the request
        var request = this.url + encodeURIComponent(JSON.stringify(this.JSON));

        // writing to a file
        fout = fs.openWrite("push-predictions.json");
        fout.write(request);
        fout.close();

        http.getStr(request, successCallback, errorCallback);

        this.JSON = [];
    }

}

var pPusher = new PPusher();

// make the merger & resampler & corresponding stores
http.onGet("init", function (request, response) {    
    modelEPEX[0].initialize();    

    http.jsonp(request, response, "OK");
});

http.onGet("update-data", function (request, response) {
    // use modelCSI[0].updateTimeStamps();
    var url = modelEPEX[0].loadData(1000);

    response.send(url);
});

http.onGet("initial-load", function (request, response) {
    var url = modelEPEX[0].loadData(100000000);
    response.send(url);
});

http.onGet("update-timestamps", function (request, response) {
    var response = modelEPEX[0].updateTimestamps();

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
    buffer = runModelsOffline(modelEPEX, [0]);
    http.jsonp(request, response, viz.highchartsTSConverter(buffer));
});

function runModelsOffline(models, parameters) {
    // initialize offsets
    var offset = 2000;
    var oldOffset = -1;

    // evaluation offsets
    var learnOffset = 2 * 365 * 24;
    var learnEndOffset = 3.3 * 365 * 24;
    // learnEndOffset = 400;  // fast finish for debugging
    var drawOffset = 2.7 * 365 * 24;
    var drawOffsetEnd = 3.3 * 365 * 24;

    for (var i = 0; i < models.length; i++) {
        // source stores        
        console.log("Linking source data stores (" + i + ") ...")
        models[i].updateStoreHandlers();
        models[i].createMetaStore();

        console.log(models[i].metaMergedStore.name);

        // create feature space    
        console.log("Create feature space ...");
        models[i].initFtrSpace();                
        
        // normalization - learning    
        var normOffset = models[0].findNextOffset(offset);

        // initialize models
        console.log("Initialize model");
        models[i].initModel();
    };

    console.log("Learning normalization parameters ...");
    if (
         (models[0].conf.method == "svmr") || (models[0].conf.method == "ht") ||
         (models[0].conf.method == "nn") || (models[0].conf.method == "linreg")
        ) {
        for (var j = 0; j < models[0].conf.normNum; j++) {
            normOffset = models[0].findNextOffset(normOffset);
            var rec = models[0].getRecord(normOffset + j);
            for (var i = 0; i < models.length; i++) {
                console.log("i = ", i);
                // ftrSpace = ...
                models[i].ftrSpace.updateRecord(rec);
            }
        }
    }

    // finds next suitable offset
    offset = models[0].findNextOffset(offset);
    
    // buffer to draw
    var drawBuffer = [];

    // repeat until OK
    while ((offset != oldOffset) && (offset < learnEndOffset)) {
        for (var i = 0; i < models.length; i++) {
            // perform modelling on existing offset
            var val = models[i].predict(offset);
            console.log(val);

            // learn
            models[i].learn(offset);
            var predictionTime = models[i].rec.Time.add(models[i].conf.prediction.ts, "hour");
            // console.say("Prediction time: " + predictionTime.string + ", " + models[i].conf.prediction.ts + ", " + i);

            if (offset > learnOffset) {
                // calculate errors
                modelEvals[i].update(models[i].value, val);
                modelEval.update(models[i].value, val);
                // add to pusher
                pPusher.add(modelEval, val, models[i].conf.prediction.name, models[i].conf.modelid, predictionTime.string);

                if ((i + 1) % 6 == 0) {
                    pPusher.push();
                }
            }

            // draw graph
            if ((offset > drawOffset) && (offset < drawOffsetEnd))
                drawBuffer.push({ Prediction: { Val: val, Time: predictionTime.string }, Value: { Val: models[i].value, Time: predictionTime.string } });           
        }

        // calculate new offset
        oldOffset = offset;
        offset = models[0].findNextOffset(offset);
    }
    

    // make visualizations
    // Offline (no server is needed)
    console.say("Saving chart HTML");    
    viz.drawHighChartsTimeSeries(viz.highchartsTSConverter(drawBuffer), "plot-" + models[0].conf.name + ".html", {
        title: { text: "CSI: prediction vs. true value" }, subtitle: { text: "" }, chart: { zoomType: "x" }, tooltip: {
            headerFormat: '<b>{series.name}</b><br>',
            pointFormat: '{point.x:%e. %b. %Y %I:%M:%S}: {point.y:.2f} '
        },
    });
    console.say("Done");

    // export and print evaluation data
    var errors = "me;mae;mse;rmse;rsquared\n" + modelEval.me.getError() + ";" + modelEval.mae.getError() + ";" + modelEval.mse.getError() + ";" + modelEval.rmse.getError() + ";" + modelEval.r2.getError() + "\n\n\n";    

    var str = "me;mae;mse;rmse;rsquared\n"
    for (i = 0; i < models.length; i++) {
        str += modelEvals[i].me.getError() + ";" + modelEvals[i].mae.getError() + ";" + modelEvals[i].mse.getError() + ";" + modelEvals[i].rmse.getError() + ";" + modelEvals[i].r2.getError() + "\n";
    };

    str = errors + str;

    // convert . to , for Excel - Slovenian settings
    str = str.replace(/\./g, ",");

    console.say(str);
    fout = fs.openWrite("results-" + models[0].conf.name + ".csv");
    fout.write(str);
    fout.close();

    // save feature space
    var header = "";
    fout = fs.openWrite("ftrspace");
    var json = models[0].ftrDef;
    for (i = 0; i < json.length; i++) {
        header = header + json[i].field + ";";
    }
    header = header + "\n";
    fout.write(header);
    fout.close();

    // save model
    // linear regression
    if (models[0].conf.method == "linreg") {
        fout = fs.openWrite("weights-" + models[0].conf.name + ".csv");
        fout.write(header);
        var str = "";
        for (i = 0; i < models.length; i++) {
            var vec = models[i].linreg.weights;
            vec.print();        
            for (j = 0; j < vec.length; j++)  {
                str += vec[j] + ";";
            };
            str += "\n";
        }
        str = str.replace(/\./g, ",");
        fout.write(str);
        fout.close();
    }

    // hoefding tree
    if (models[0].conf.method == "ht") {
        for (i = 0; i < models.length; i++) {
            models[i].ht.exportModel({ "file": "./sandbox/ht-" + i + ".gv", "type": "DOT" });
        }
    };

    return drawBuffer;
}


function runModelOld(parameters) {
    // resample store start is at 3:00:00 + 6 is first noon
    // init modeling conditions
    var startoffset = 6 + 3 * 24;  // starting at noon 
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
    var linreg = analytics.newRecLinReg({ "dim": ftrSpace.dim, "forgetFact": 1.0 }); 
    // var ridreg = new analytics.ridgeRegression(0.1, ftrSpace.dim, 2* 365);
    // var NN = analytics.newNN({ "layout": [ftrSpace.dim, 12, 4, 3, 1] });    
    // var svmR = svmrModule.newSvmRegression(ftrSpace.dim, { "c": parameters[0], "eps": 0.04, "maxTime": 5, "maxIterations": 1000000, batchSize: 365 }, 365);
    // var movAvr = baselinePredictors.newMovAvrVal(30);
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
        prediction = linreg.predict(vec);
        // prediction = ridreg.predict(vec);
        // predictions = NN.predict(vec); prediction = predictions[0];
        // prediction = svmR.predict(vec);
        // prediction = movAvr.predict();
        
        // var vecArr = [];
        // for (var rowN = 0; rowN < vec.length; rowN++) {
        //     vecArr.push(vec.at(rowN));
        // }
        // prediction = ht.predict([], vecArr);        

        // get value
        console.log("Get learn value");
        var value = model.getLearnValue(modelConf, resampledStore, offset);
        // NN - value normalization
        value = value / modelConf.normFactor;
        // outVec = linalg.newVec([value]);
        // console.log("Value: " + value)

        // learn        
        console.log("Learn");
        linreg.learn(vec, value);        
        // ridreg.addupdate(vec, value);
        // NN.learn(vec, outVec);
        // learn every N samples        
        
        // if ((i % 365 != 0) && (i != 0)) svmR.add(vec, value);
        // else {
            // la.printFeatVec(vec, ftrSpace);
        //     svmR.learn(vec, value);
        // } 
        
        // movAvr.update(value);
        ht.process([], vecArr, value);
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
        console.log(offset + " - diff: " + diff);
        str += i + ";" + value + ";" + prediction + "\n";
        // move 1 day forward
        offset += 24;        
    }

    // ht.exportModel({ "file": "./sandbox/ht/epex.gv", "type": "DOT" });

    var errors = "me;mae;mse;rmse;rsquared\n" + me.getError() + ";" + mae.getError() + ";" + mse.getError() + ";" + rmse.getError() + ";" + rsquare.getError() + "\n\n\n";
    str = errors + str;

    console.log(errors);

    str = str.replace(/\./g, ",");
    // create feature vector
    // http.jsonp(request, response, pError);
    return str;
    return mse.getError();
};




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