exports.getMergerConf = function (model) {
    mergerConf = {
        type: "stmerger", name: model.name + "merger",
        outStore: model.name, createStore: false,
        timestamp: 'Time',
        fields: []
    };

    // update merger conf from model definition
    for (i = 0; i < model.sensors.length; i++) {
        var sourceMStr = "M" + nameFriendly(model.sensors[i].name);
        var sourceAStr = "A" + nameFriendly(model.sensors[i].name);
        // add measurement fields
        for (j = 0; j < model.sensors[i].ts.length; j++) {
            var outFieldName = nameFriendly(model.sensors[i].name) + "XVal" + j;
            var fieldJSON = { source: sourceMStr, inField: 'Val', outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
            mergerConf.fields.push(fieldJSON);
        }
        // add aggregate fields
        for (j = 0; j < model.sensors[i].aggrs.length; j++) {
            var aggrName = model.sensors[i].aggrs[j];
            var outFieldName = nameFriendly(model.sensors[i].name) + "X" + aggrName;
            fieldJSON = { source: sourceAStr, inField: aggrName, outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
            mergerConf.fields.push(fieldJSON);
        }
    };

    return mergerConf;
}

exports.getMergedStoreDef = function(mergerConf, pre) {
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

exports.getResampledAggrDef = function (mergerConf, modelConf) {
    var conf = {
        name: "Resample1h", type: "resampler",
        outStore: "R" + mergerConf.outStore, timestamp: "Time",
        fields: [],
        createStore: false, interval: modelConf.resampleint
    }
    
    for (i = 0; i < mergerConf.fields.length; i++) {
        // parsing outField name
        var outFieldNm = mergerConf.fields[i].outField;
        conf.fields.push({ "name": outFieldNm, "interpolator": "previous" });
    };

    return conf;
}

exports.makeStores = function (model) {
    // create measurement and aggregate stores for all sensors
    for (i = 0; i < model.sensors.length; i++) {
        // prepare store names
        var sourceMStr = "M" + nameFriendly(model.sensors[i].name);
        var sourceAStr = "A" + nameFriendly(model.sensors[i].name);

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
        if (storeA == null) {
            storeA = qm.createStore([storeAJSON]);
        }
    }
}

exports.getFields = function (model) {
    var mergerJSON = getMergerConf(modelConf);
    var fields = [];
    for (i = 0; i < mergerConf.fields.length; i++) {
        // parsing outField name
        var outFieldNm = mergerConf.fields[i].outField;
        fields.push(outFieldNm);
    };
    return fields;
}

exports.getFtrSpaceDef = function(model) {
    var ftrDef = [];
    // time
    var fieldJSON = { type: "multinomial", source: "R" + model.name, field: "Time", datetime: true };
    // ftrDef.push(fieldJSON);

    for (i = 0; i < model.sensors.length; i++) {        
        // get resampled store field name
        var outFieldName = nameFriendly(model.sensors[i].name) + "XVal";
        // get all the needed values
        for (j = 0; j < model.sensors[i].ts.length; j++) {
            var reloffset = model.sensors[i].ts[j];
            var fieldJSON = { type: "numeric", source: { "store": "R" + model.name }, field: outFieldName + j, normalize: true };
            ftrDef.push(fieldJSON);            
        }
        // add aggregate fields
        for (j = 0; j < model.sensors[i].aggrs.length; j++) {
            var aggrName = model.sensors[i].aggrs[j];
            var outFieldName = nameFriendly(model.sensors[i].name) + "X" + aggrName;            
            var fieldJSON = { type: "numeric", source: { "store": "R" + model.name }, field: outFieldName, normalize: true };
            ftrDef.push(fieldJSON);
        }
    };

    return ftrDef;
}

exports.getHtFtrSpaceDef = function (model) {
    var ftrDef = {};
    ftrDef["dataFormat"] = [];
    for (i = 0; i < model.sensors.length; i++) {
        // get resampled store field name
        var outFieldName = nameFriendly(model.sensors[i].name) + "XVal";
        // get all the needed values
        for (j = 0; j < model.sensors[i].ts.length; j++) {
            var reloffset = model.sensors[i].ts[j];
            var outFieldNamej = outFieldName + j;
            ftrDef[outFieldNamej] = { type: "numeric" };
            ftrDef.dataFormat.push(outFieldNamej);
        }
        // add aggregate fields
        for (j = 0; j < model.sensors[i].aggrs.length; j++) {
            var aggrName = model.sensors[i].aggrs[j];
            var outFieldName = nameFriendly(model.sensors[i].name) + "X" + aggrName;
            var outFieldNamej = outFieldName + j;
            ftrDef[outFieldNamej] = { type: "numeric" };
            ftrDef.dataFormat.push(outFieldNamej);
        }
    }

    return ftrDef;
}

exports.getLearnValue = function(model, store, offset) {
    var outFieldName = nameFriendly(model.prediction.name) + "XVal0";
    var value = store[offset + model.prediction.ts][outFieldName];
    return value;
}

exports.getRecord = function (model, store, offset) {
    var rec = store[offset];
    // add time
    // rec.push(store[offset][model.timestamp]);
    // get vector of values    
    for (i = 0; i < model.sensors.length; i++) {        
        // get resampled store field name
        var outFieldName = nameFriendly(model.sensors[i].name) + "XVal";
        // get all the needed values
        for (j = 0; j < model.sensors[i].ts.length; j++) {
            var reloffset = model.sensors[i].ts[j];
            rec[outFieldName + j] = (store[offset + reloffset][outFieldName + "0"]);
        }
        // add aggregate fields
        for (j = 0; j < model.sensors[i].aggrs.length; j++) {
            var aggrName = model.sensors[i].aggrs[j];
            var outFieldName = nameFriendly(model.sensors[i].name) + "X" + aggrName;            
            rec[outFieldName] = store[offset][outFieldName];
        }
    };

    return rec;    
};

exports.getFetchURL = function (model, startDate, endDate, lastTs) {
    // http://localhost:9889/enstream/push-sync-stores?sid=Electricity-Price,Electricity-Quantity,WU-Duesseldorf-WU-temperature,WU-Duesseldorf-WU-windspeed,WU-Duesseldorf-WU-humidity,WU-Duesseldorf-WU-pressure,WU-Duesseldorf-WU-cloudcover&startdate=2010-01-01&enddate=2010-12-31&lastTs=0
    var url = "http://localhost:9889/enstream/push-sync-stores?sid=";

    // update merger conf from model definition
    for (i = 0; i < model.sensors.length; i++) {
        if (i != 0) url += ",";
        url += model.sensors[i].name;
    };

    url += "&startdate=" + startDate + "&enddate=" + endDate + "&lastTs=" + lastTs;

    return url;
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
