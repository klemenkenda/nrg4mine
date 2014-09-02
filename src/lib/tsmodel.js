exports.makeStreamMerger = function (model) {
    mergerConf = {
        type: "stmerger", name: "merged",
        outStore: model.name, createStore: true,
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
