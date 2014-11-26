/**
 * QMiner - Open Source Analytics Platform
 * 
 * Copyright (C) 2014 Jozef Stefan Institute
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License, version 3,
 * as published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 * 
 */

///////////////////////////////
//#
//# ### tsmodel.js (use require)
//#
//# Handling time-series modelling.
//# The library must be loaded using `var tsmodel = require('tsmodel.js');`.
//# 
//# **Functions and properties:**
//#

//////////// TS MODEL
//#- `model = evaluation.newTSModel()` -- create new time-series model.
//#   - `mc = model.getMergerConf()` -- Returns stream merger configuration, derived from model configuration.
//#   - `msd = model.getMergeStoreDef(pre)` -- Returns merged store definition, derived from merger configuration `mc`, `pre` is set to either "" (for merger store) or to "R" for resampled merger store.
exports.TSModel = function (conf) {        
    this.conf = conf;       // model configuration
    
    this.lastSensorTs = 24 * 60 * 60 + 10;       // last timestamp of pulled sensor data
    this.lastFeatureTs = 24 * 60 * 60 + 10;      // last timestamp of pulled features
    this.lastPredictionTs = 24 * 60 * 60 + 10;   // last timestamp of pulled weather predictions

    this.mergerConf;        // merger conf
    this.resampledConf;     // resampled store configuration
    this.pMergerConf;       // merger conf for weather predictions
    this.fMergerConf;       // merger conf for features
    this.mMergerConf;

    this.ftrDef;            // feature space definition
    this.htFtrDef;          // Hoeffding tree feature space definition

    this.mergedStore;       // merged store
    this.resampledStore;    // resampled store
    this.pMergedStore;      // weather predictions merged store
    this.fMergedStore;      // additional features merged store
    this.metaMergedStore;   // store holding all meta records
    this.predictionStore;   // store for predictions

    this.ftrSpace;          // feature space

    this.rec;               // current record we are working on
    this.vec;               // feature vector, constructed from record
    this.vecHtArr;          // Hoeffding tree vector --> array

    this.linreg;            // linear regression (method)
    this.movavg;            // moving average (method)
    this.ht;                // Hoeffding tree (method)
    this.nn;                // neural networks (method)
    this.svmr;              // SVM regression (method)
    this.svmrcounter;       // SVMR counter
    this.rr;                // ridge regression (method)

    this.value;             // current true learned value;
    this.prediction;        // prediction

    this.psAggr;            // RCA aggregate

    /* modelling function */

    // METHOD: predict()
    // Make the prediction
    this.learn = function (offset) {
        // we expect feature vector to be set from before
        this.value = this.getLearnValue(this.resampledStore, offset);
        switch (this.conf.method) {
            case "movavg":
                this.movavg.update(this.value);
                break
            case "linreg":
                this.linreg.learn(this.vec, this.value);
                break;
            case "ht":               
                this.ht.process([], this.vecHtArr, this.value);
                break;
            case "nn":
                var outVec = linalg.newVec([this.value]);
                this.nn.learn(this.vec, outVec);
                break;
            case "svmr":
                this.svmrcounter++;
                if (this.svmrcounter % this.conf.paramssvmr.learnskip == 0) {
                    this.svmr.learn(this.vec, this.value / this.conf.normFactor);
                } else {
                    this.svmr.add(this.vec, this.value / this.conf.normFactor)
                }
                break;
        }
    }

    // METHOD: predict()
    // Make the prediction
    this.predict = function (offset) {
        // general stuff
        var rec;
        console.say("Getting record for offset: " + offset)
        rec = this.getRecord(offset);
        console.say("Creating feature vector ...");        
        this.createFtrVec();        
        var val = -1;
        console.say("Making the model prediction ...");
        switch (this.conf.method) {
            case "movavg":
                val = this.movavg.predict();
                break;
            case "linreg":
                val = this.linreg.predict(this.vec);
                break;
            case "ht":
                this.vecHtArr = [];
                for (var rowN = 0; rowN < this.vec.length; rowN++) {
                    this.vecHtArr.push(this.vec.at(rowN));
                }
                val = this.ht.predict([], this.vecHtArr);  
                break;
            case "nn":
                val = this.nn.predict(this.vec)[0];
                break;
            case "svmr":                
                val = this.svmr.predict(this.vec) * this.conf.normFactor;
                break;
        }

        // save prediction to the model object
        this.prediction = val;        

        return val;
    }

    // METHOD: createFtrVec()
    this.createFtrVec = function () {
        this.vec = this.ftrSpace.ftrVec(this.rec);
    }

    // METHOD: initModel()
    // Init model from configuration
    this.initModel = function () {
        switch (this.conf.method) {
            case "movavg":
                console.log("Initializing moving average");
                this.movavg = baselinePredictors.newMovAvrVal(this.conf.paramsmovavg.window);
                break;
            case "linreg":
                console.log("Initializing linreg ...")
                this.linreg = analytics.newRecLinReg({ "dim": this.ftrSpace.dim, "forgetFact": 1.0 });                
                break;
            case "ht":
                console.log("Initializing Hoeffding tree ...");
                var htConf = this.getHtFtrSpaceDef(modelConf);
                this.ht = analytics.newHoeffdingTree(htConf, this.conf.paramsht);
                break;
            case "nn":
                console.log("Initializing NN ...")
                this.conf.paramsnn.layout[0] = this.ftrSpace.dim;
                this.nn = analytics.newNN(this.conf.paramsnn);
                break;
            case "svmr":
                console.log("Initializing SVMR ...");
                this.svmr = svmrModule.newSvmRegression(this.ftrSpace.dim, this.conf.paramssvmr.params, this.conf.paramssvmr.window);
                this.svmrcounter = 0;
                break;
        }
    }

    // METHOD: initFtrSpace()
    // Init feature space
    this.initFtrSpace = function () {
        this.getFtrSpaceDef();
        this.ftrSpace = analytics.newFeatureSpace(this.ftrDef);
        console.log("FtrSp dim: " + this.ftrSpace.dim);        
    };

    // METHOD: findNextOffset(offset)
    // Finds next suitable offset from the current offset up
    this.findNextOffset = function (offset) {
        i = 1;
        while (i + offset < this.resampledStore.length) {
            if (this.resampledStore[i + offset].Time.hour == this.conf.type.startHour) {
                console.log("Matched next time: " + this.resampledStore[i + offset].Time.string);
                offset += i;
                break;
            }
            i++;
        }

        return offset;
    }    

    /* configuration & loading functions */

    // METHOD: getMetaMergerConf - sensors
    // Calculates, stores and returns meta merger stream aggregate configuration for the model configuration.
    // Meta merger is not really used; it is a concept, explaining the joining of sensors, predictions and 
    // additional features.
    this.getMetaMergerConf = function () {
        this.mMergerConf = {
            type: "stmerger", name: this.conf.storename + "merger",
            outStore: "M" + this.conf.name + this.conf.storename, createStore: false,
            timestamp: 'Time',
            fields: []
        };

        // update merger conf from model definition
        for (i = 0; i < this.conf.sensors.length; i++) {

            var sourceMStr = "M" + nameFriendly(this.conf.sensors[i].name);
            var sourceAStr = "A" + nameFriendly(this.conf.sensors[i].name);
            // add measurement fields                
            for (j = 0; j < this.conf.sensors[i].ts.length; j++) {
                var outFieldName = nameFriendly(this.conf.sensors[i].name) + "XVal" + j;
                var fieldJSON = { source: sourceMStr, inField: 'Val', outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
                this.mMergerConf.fields.push(fieldJSON);
            }

            // add aggregate fields
            if (this.conf.sensors[i].type != "prediction") {
                for (j = 0; j < this.conf.sensors[i].aggrs.length; j++) {
                    var aggrName = this.conf.sensors[i].aggrs[j];
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "X" + aggrName;
                    fieldJSON = { source: sourceAStr, inField: aggrName, outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
                    this.mMergerConf.fields.push(fieldJSON);
                }
            }
        }

        return this.mMergerConf;
    }

    // METHOD: getMergerConf - sensors
    // Calculates, stores and returns merger stream aggregate configuration for the model configuration
    this.getMergerConf = function () {
        this.mergerConf = {
            type: "stmerger", name: this.conf.storename + "merger",
            outStore: this.conf.storename, createStore: false,
            timestamp: 'Time',
            fields: []
        };

        // update merger conf from model definition
        for (i = 0; i < this.conf.sensors.length; i++) {            
            if (this.conf.sensors[i].type == "sensor") {                
                var sourceMStr = "M" + nameFriendly(this.conf.sensors[i].name);
                var sourceAStr = "A" + nameFriendly(this.conf.sensors[i].name);
                // add measurement fields                
                for (j = 0; j < this.conf.sensors[i].ts.length; j++) {
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "XVal" + j;
                    var fieldJSON = { source: sourceMStr, inField: 'Val', outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
                    this.mergerConf.fields.push(fieldJSON);
                }
                
                // add aggregate fields
                for (j = 0; j < this.conf.sensors[i].aggrs.length; j++) {
                    var aggrName = this.conf.sensors[i].aggrs[j];
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "X" + aggrName;
                    fieldJSON = { source: sourceAStr, inField: aggrName, outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
                    this.mergerConf.fields.push(fieldJSON);
                }
            }
        };        

        return this.mergerConf;
    }

    // METHOD: getFMergerConf - features
    // Calculates, stores and returns features merger stream aggregate configuration for the model configuration
    this.getFMergerConf = function () {
        this.fMergerConf = {
            type: "stmerger", name: this.conf.storename + "fmerger",
            outStore: "F" + this.conf.storename, createStore: false,
            timestamp: 'Time',
            fields: []
        };

        // update merger conf from model definition
        for (i = 0; i < this.conf.sensors.length; i++) {
            if (this.conf.sensors[i].type == "feature") {
                var sourceMStr = "M" + nameFriendly(this.conf.sensors[i].name);
                var sourceAStr = "A" + nameFriendly(this.conf.sensors[i].name);
                // add measurement fields
                for (j = 0; j < this.conf.sensors[i].ts.length; j++) {
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "XVal" + j;
                    var fieldJSON = { source: sourceMStr, inField: 'Val', outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
                    this.fMergerConf.fields.push(fieldJSON);
                }
                // add aggregate fields
                for (j = 0; j < this.conf.sensors[i].aggrs.length; j++) {
                    var aggrName = this.conf.sensors[i].aggrs[j];
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "X" + aggrName;
                    fieldJSON = { source: sourceAStr, inField: aggrName, outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
                    this.fMergerConf.fields.push(fieldJSON);
                }
            }
        };

        return this.fMergerConf;
    }

    // METHOD: getPMergerConf - weather predictions
    // Calculates, stores and returns weather prediction merger stream aggregate configuration for the model configuration
    this.getPMergerConf = function () {
        this.pMergerConf = {
            type: "stmerger", name: this.conf.storename + "pmerger",
            outStore: "P" + this.conf.storename, createStore: false,
            timestamp: 'Time',
            fields: []
        };

        // update merger conf from model definition
        for (i = 0; i < this.conf.sensors.length; i++) {
            if (this.conf.sensors[i].type == "prediction") {
                var sourceMStr = "M" + nameFriendly(this.conf.sensors[i].name);                
                // add measurement fields
                for (j = 0; j < this.conf.sensors[i].ts.length; j++) {
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "XVal" + j;
                    var fieldJSON = { source: sourceMStr, inField: 'Val', outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
                    this.pMergerConf.fields.push(fieldJSON);
                }                
            }
        };

        return this.pMergerConf;
    }

    // METHOD: getMergedStoreDef
    // Returns merged store definition, based on mergerConf (sensor, feature, prediction)
    this.getMergedStoreDef = function (pre, mergerConf) {
        // TODO: what if we wanted date indexing?
        var storeMergedJSON = {
            "name": pre + mergerConf.outStore,
            "fields": [
                { "name": "Time", "type": "datetime" }
            ],
            "joins": [],
            "keys": []
        };

        for (i = 0; i < mergerConf.fields.length; i++) {
            // parsing outField name
            var outFieldNm = mergerConf.fields[i].outField;
            storeMergedJSON.fields.push({ "name": outFieldNm, "type": "float" });
        };

        return storeMergedJSON;
    }

    // METHOD: getResampledAggrDef
    // Returns resampled store definition
    this.getResampledAggrDef = function () {
        this.resampledConf = {
            name: "Resample1h", type: "resampler",
            outStore: "R" + this.mergerConf.outStore, timestamp: "Time",
            fields: [],
            createStore: false, interval: this.conf.resampleint
        }

        for (i = 0; i < this.mergerConf.fields.length; i++) {
            // parsing outField name
            var outFieldNm = this.mergerConf.fields[i].outField;
            this.resampledConf.fields.push({ "name": outFieldNm, "interpolator": "previous" });
        };

        return this.resampledConf;
    }

    // METHOD: makeStores
    // Makes appropriate stores for the merger, if they do not exist.
    this.makeStores = function () {
        // create measurement and aggregate stores for all sensors
        console.say(this.conf);
        for (i = 0; i < this.conf.sensors.length; i++) {
            // prepare store names
            var sourceMStr = "M" + nameFriendly(this.conf.sensors[i].name);
            var sourceAStr = "A" + nameFriendly(this.conf.sensors[i].name);

            // get stores (we'll check later if they exist)
            var storeM = qm.store(sourceMStr);
            var storeA = qm.store(sourceAStr);

            // get JSON definition of measurement store
            var storeMJSON = {
                "name": sourceMStr,
                "fields": [
                    { "name": "Time", "type": "datetime" },
                    { "name": "Date", "type": "string" },
                    { "name": "Val", "type": "float" }
                ],
                "joins": [],
                "keys": [
                    { "field": "Date", "type": "value", "sort": "string", "vocabulary": "date_vocabulary" }
                ]
            };

            // get JSON definition of aggregate store
            var storeAJSON = getAggregateStoreStructure(sourceAStr);

            // if the store does not exits, create new
            if (storeM == null) {
                storeM = qm.createStore([storeMJSON]);
            };
            // for weather predictions we do not have aggregate store
            if (this.conf.sensors[i].type != "prediction") {
                if (storeA == null) {
                    storeA = qm.createStore([storeAJSON]);
                }
            }
        }
    }

    // METHOD: getFields
    // Get array of fields in the merger.
    this.getFields = function () {        
        var fields = [];
        for (i = 0; i < this.mergerConf.fields.length; i++) {
            // parsing outField name
            var outFieldNm = this.mergerConf.fields[i].outField;
            fields.push(outFieldNm);
        };
        return fields;
    }

    // METHOD: getFtrSpaceDef
    // Calculate ftrSpaceDefinition from model configuration.
    this.getFtrSpaceDef = function () {
        this.ftrDef = [];
        // time
        // multinomial is not good
        // var fieldJSON = { type: "multinomial", source: "R" + this.conf.storename, field: "Time", datetime: true };
        // ftrDef.push(fieldJSON);

        for (i = 0; i < this.conf.sensors.length; i++) {
            // get resampled store field name
            var outFieldName = nameFriendly(this.conf.sensors[i].name) + "XVal";
            var pre = "M" + this.conf.name; // for sensors            
            // get all the needed values
            for (j = 0; j < this.conf.sensors[i].ts.length; j++) {
                var reloffset = this.conf.sensors[i].ts[j];
                var fieldJSON = { type: "numeric", source: { "store": pre + this.conf.storename }, field: outFieldName + j, normalize: true };
                this.ftrDef.push(fieldJSON);
            }
            // add aggregate fields
            if (this.conf.sensors[i].type != "prediction") {
                for (j = 0; j < this.conf.sensors[i].aggrs.length; j++) {
                    var aggrName = this.conf.sensors[i].aggrs[j];
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "X" + aggrName;
                    var fieldJSON = { type: "numeric", source: { "store": pre + this.conf.storename }, field: outFieldName, normalize: true };
                    this.ftrDef.push(fieldJSON);
                }
            }
        };

        return this.ftrDef;
    }

    // METHOD: getHtFtrSpaceDef
    // Calculate htFtrSpaceDefinition from model configuration - for Hoeffding trees regression.
    this.getHtFtrSpaceDef = function () {
        this.htFtrDef = {};
        this.htFtrDef["dataFormat"] = [];
        for (i = 0; i < this.conf.sensors.length; i++) {
            // get resampled store field name
            var outFieldName = nameFriendly(this.conf.sensors[i].name) + "XVal";
            // get all the needed values
            for (j = 0; j < this.conf.sensors[i].ts.length; j++) {
                var reloffset = this.conf.sensors[i].ts[j];
                var outFieldNamej = outFieldName + j;
                this.htFtrDef[outFieldNamej] = { type: "numeric" };
                this.htFtrDef.dataFormat.push(outFieldNamej);
            }
            // add aggregate fields
            if (this.conf.sensors[i].type != "prediction") {
                for (j = 0; j < this.conf.sensors[i].aggrs.length; j++) {
                    var aggrName = this.conf.sensors[i].aggrs[j];
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "X" + aggrName;
                    var outFieldNamej = outFieldName + j;
                    this.htFtrDef[outFieldNamej] = { type: "numeric" };
                    this.htFtrDef.dataFormat.push(outFieldNamej);
                }
            }
        }

        return this.htFtrDef;
    }

    // METHOD: getLearnValue
    // Get Learn Value for specified offset.
    this.getLearnValue = function (store, offset) {
        var outFieldName = nameFriendly(this.conf.prediction.name) + "XVal0";
        var value = store[offset + this.conf.prediction.ts][outFieldName];
        return value;
    }

    // METHOD: canLearn
    // Can learn value be determined for the current offset
    this.canLearn = function (store, offset) {
        if (offset + this.conf.prediction.ts > store.length) return false;
        return true;
    }

    this.getOffset = function (time0, store) {
        // get last offset time for a store
        var lastTm = store.last.Time;
        // calculate initial timestamps
        var lastTs = 0;
        time0Ts = time0.timestamp;
        var i = 0;
        var offset = 0;
        while ((Math.abs(lastTs - time0Ts) > 30 * 60) && (i < 1000)) {
            i++;
            // get number of hours
            lastTs = lastTm.timestamp;
            hours = Math.round((lastTs - time0Ts) / 3600);
            offset += hours;
            if (offset >= 0) {
                lastTm = store[store.length - 1 - offset].Time;
                lastTs = lastTm.timestamp;
            };
        };
        if (i == 1000) console.say("Offset not found ...");
        return store.length - 1 - offset;
    };

    // METHOD: getRecord
    // Get record for specified offset.
    this.getRecord = function (offset) {
        var origoffset = offset;
        // define stores
        resampledStore = this.resampledStore;
        predictionStore = this.pMergedStore;
        featuresStore = this.fMergedStore;
        metaStore = this.metaMergedStore;

        // get original record with blanks for previous values
        var rec = {};
        // extract current record time
        var time0 = resampledStore[offset].Time;
        // find time pointers in the stores
        var sensorOffset = offset;
        var predictionOffset = this.getOffset(time0, predictionStore);
        var featuresOffset = this.getOffset(time0, featuresStore);

        // find out time
        // get offset in predictions
        // get offset in additional features

        // get vector of values    
        for (i = 0; i < this.conf.sensors.length; i++) {
            // distinguish type of sensor
            switch (this.conf.sensors[i].type) {
                case "sensor":
                    store = resampledStore;
                    offset = sensorOffset;
                    break;
                case "prediction":
                    store = predictionStore;
                    offset = predictionOffset;
                    break;
                case "feature":
                    store = featuresStore;
                    offset = featuresOffset;
                    break;
            };
            // get resampled store field name
            var outFieldName = nameFriendly(this.conf.sensors[i].name) + "XVal";
            // get all the needed values
            for (j = 0; j < this.conf.sensors[i].ts.length; j++) {
                var reloffset = this.conf.sensors[i].ts[j];
                rec[outFieldName + j] = (store[(offset + reloffset)][outFieldName + "0"]);
            }
            // add aggregate fields
            if (this.conf.sensors[i].type != "prediction") {
                for (j = 0; j < this.conf.sensors[i].aggrs.length; j++) {
                    var aggrName = this.conf.sensors[i].aggrs[j];
                    var outFieldName = nameFriendly(this.conf.sensors[i].name) + "X" + aggrName;
                    rec[outFieldName] = store[offset][outFieldName];
                }
            };
        };

        // update object record
        rec.Time = resampledStore[origoffset].Time.string;
        rec.PredictionTime = rec.Time;
        metaStore.add(rec); 
        this.rec = metaStore.last;        

        // return the record
        return this.rec;
    };    

    this.loadData = function (maxitems) {
        scope = this;
        
        // SENSORS
        // TODO: sensor should be loaded last if 
        // stream aggregate for on-line predictions is
        // to be used (!)
        var url = this.conf.dataminerurl + "?sid=";
        // update url from model definition
        ii = 0;
        for (i = 0; i < this.conf.sensors.length; i++) {
            if (this.conf.sensors[i].type == "sensor") {
                ii++;
                if (ii != 1) url += ",";
                url += this.conf.sensors[i].name;
            };
        };
        url += "&remoteURL=" + this.conf.callbackurl + "add";
        url += "&lastts=" + this.lastSensorTs;
        url += "&maxitems=" + maxitems;
        console.log(url);
        
        http.getStr(url, function(str) {
            console.log("done - sensors: " + str);
            scope.lastSensorTs = parseInt(str) - 1;        
        }, function (str) {
            console.log(str + "!");
            scope.str = str;
        });

        // FEATURES
        url = this.conf.dataminerurl + "?sid=";
        // update url from model definition
        ii = 0;
        for (i = 0; i < this.conf.sensors.length; i++) {
            if (this.conf.sensors[i].type == "feature") {
                ii++;
                if (ii != 1) url += ",";
                url += this.conf.sensors[i].name;
            };
        };
        url += "&remoteURL=" + this.conf.callbackurl + "add";
        url += "&lastts=" + this.lastFeatureTs;
        url += "&maxitems=" + maxitems;
        console.log(url);        
        http.getStr(url, function (str) {
            console.log("done - properties: " + str);
            scope.lastFeatureTs = parseInt(str) - 1;            
        }, function (str) {
            console.log(str + "!");
            scope.str = str;            
        });
        
        // WEATHER PREDICTIONS        
        url = this.conf.dataminerurl + "?sid=";
        // update url from model definition
        ii = 0;
        for (i = 0; i < this.conf.sensors.length; i++) {
            if (this.conf.sensors[i].type == "prediction") {
                ii++;
                if (ii != 1) url += ",";
                url += this.conf.sensors[i].name;
            };
        };
        url += "&remoteURL=" + this.conf.callbackurl + "update";
        url += "&lastts=" + this.lastPredictionTs;
        url += "&prediction=1";
        url += "&maxitems=" + maxitems;
        console.log(url);
        http.getStr(url, function (str) {
            console.log("done - predictions: " + str);
            scope.lastPredictionTs = parseInt(str) - 1;            
        }, function (str) {
            console.log(str + "!");            
        });

        return url;
    }

    // METHOD: updateTimestamps
    // Updates last timestamps from the last records in the stores
    this.updateTimestamps = function () {
        this.lastSensorTs = this.mergedStore.last.Time.timestamp;
        this.lastFeatureTs = this.fMergedStore.last.Time.timestamp;
        this.lastPredictionTs = this.pMergedStore.last.Time.timestamp;

        console.log("Sensor: " + lastSensorTs);
        console.log("Feature: " + lastFeatureTs);
        console.log("Prediction: " + lastPredictionTs);
    }

    // METHOD: initialize
    // Initialize sensor stores (if needed), initialize merged and resampled store if needed.
    this.initialize = function () {
        // init empty stores if no data is yet in ... 
        this.makeStores();
        this.makePredictionStore();

        // get merger conf
        var mergerJSON = this.getMergerConf();
        var pMergerJSON = this.getPMergerConf();
        var fMergerJSON = this.getFMergerConf();
        var metaMergerJSON = this.getMetaMergerConf();
        
        // get store conf
        var mergerStoreDef = this.getMergedStoreDef("", mergerJSON);
        var mergerResampledStoreDef = this.getMergedStoreDef("R", mergerJSON);
        var pMergerStoreDef = this.getMergedStoreDef("", pMergerJSON);
        var fMergerStoreDef = this.getMergedStoreDef("", fMergerJSON);        

        // create merged store and attach merger aggregate to qm
        this.mergedStore = qm.store(mergerStoreDef.name);
        if (this.mergedStore == null) {
            this.mergedStore = qm.createStore([mergerStoreDef]);
            // create merger aggregate
            qm.newStreamAggr(mergerJSON);
        }

        // create resampled store and attach resampler to merged tore
        this.resampledStore = qm.store(mergerResampledStoreDef.name);
        if (this.resampledStore == null) {            
            qm.createStore([mergerResampledStoreDef]);
            // attach resampler to the merger
            var resampledAggrDef = this.getResampledAggrDef();
            this.mergedStore.addStreamAggr(resampledAggrDef);            
        }

        // create weather prediction merger store
        this.pMergedStore = qm.store(pMergerStoreDef.name);
        if (this.pMergedStore == null) {
            console.log("Predictions");
            qm.createStore([pMergerStoreDef]);            
            qm.newStreamAggr(pMergerJSON);
        }

        // create features merger store
        this.fMergedStore = qm.store(fMergerStoreDef.name);
        if (this.fMergedStore == null) {
            console.log("Features");
            qm.createStore([fMergerStoreDef]); 
            qm.newStreamAggr(fMergerJSON);
        }

    }

    // METHOD: createPredictionStore
    // Creates store for predictions.
    this.makePredictionStore = function () {
        var storePJSON = {
            "name": "Pred" + this.conf.storename,
            "fields": [
                { "name": "Time", "type": "datetime" },
                { "name": "Date", "type": "string" },
                { "name": "TimePredicted", "type": "datetime" },
                { "name": "Val", "type": "float" },
                { "name": "Pred", "type": "float" }
            ],
            "joins": [],
            "keys": [
                { "field": "Date", "type": "value", "sort": "string", "vocabulary": "date_vocabulary" }
            ]
        };
        this.predictionStore = qm.createStore([storePJSON]);
    }

    // METHOD. updateStoreHandlers
    // Updates handles to the 4 stores (3x merged + 1x resampled)
    this.updateStoreHandlers = function () {
        console.log("Updating store handlers ...")
        this.resampledStore = qm.store("R" + this.conf.storename);
        this.mergedStore = qm.store(this.conf.storename);
        this.pMergedStore = qm.store("P" + this.conf.storename);
        this.fMergedStore = qm.store("F" + this.conf.storename);        
        this.predictionStore = qm.store("Pred" + this.conf.storename);
    }

    // METHOD: createMetaStore
    // Creates feature set-spefic meta-store
    this.createMetaStore = function () {
        var metaMergerJSON = this.getMetaMergerConf();
        var metaMergerStoreDef = this.getMergedStoreDef("", metaMergerJSON);
        this.metaMergedStore = qm.store(metaMergerStoreDef.name);
        if (this.metaMergedStore == null) {
            console.log("Creating meta merger store");
            qm.createStore([metaMergerStoreDef]);
        }
        this.metaMergedStore = qm.store("M" + this.conf.name + this.conf.storename);
    }

    // METHOD: addProcessStateAggr
    // Adds process state aggr to meta store
    this.addProcessStateAggr = function () {
        var mmStoreName = "M" + this.conf.name + this.conf.storename;        

        this.psAggr = qm.newProcessStateAggr({
            type: 'process_state',
            source: mmStoreName,
            name: 'rcaClust',
            timestamp: 'Time',
            clustering: {
                type: 'dpmeans',
                lambda: 0.8,
                minclusts: 2,
                maxclusts: 8
            },
            minRecs: 5,
            timeUnit: 'hour',
            nstates: 8,
            expandThreshold: .8,
            depth: 3,
            randSeed: 1
        });

    }
    
}

// About this module
exports.about = function () {
    var description = "Imports data according to timestamp. Instore and outstore are input parameters.";
    return description;
};


// ---------------------------------------------------------------------------
// FUNCTION: nameFriendly
// DESCRIPTION: Returns store name friendly name; only use alphanumeric
//              characters.
// ---------------------------------------------------------------------------
function nameFriendly(myName) {
    return myName.replace(/\W/g, '');
}


