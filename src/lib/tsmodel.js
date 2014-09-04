exports.getMergerConf = function (model) {
    mergerConf = {
        type: "stmerger", name: "merged",
        outStore: model.name, createStore: false,
        timestamp: 'Time',
        fields: []
    };

    // update merger conf from model definition
    for (i = 0; i < model.sensors.length; i++) {
        var sourceMStr = "M" + nameFriendly(model.sensors[i].name);
        var sourceAStr = "A" + nameFriendly(model.sensors[i].name);
        // add measurement fields
        var outFieldName = nameFriendly(model.sensors[i].name) + "XVal";
        var fieldJSON = { source: sourceMStr, inField: 'Val', outField: outFieldName, interpolation: 'previous', timestamp: 'Time' };
        mergerConf.fields.push(fieldJSON);
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
