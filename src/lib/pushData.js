// ---------------------------------------------------------------------------
// FILE: pushData.js
// AUTHOR: Klemen Kenda (IJS)
// DATE: 2014-09-01
// DESCRIPTION:
//   Pushing data from one QMiner instance to another.
// ---------------------------------------------------------------------------
// HISTORY:
// ---------------------------------------------------------------------------

exports.pushData = function (inStores, startDate, endDate, remoteURL, lastTs) {
    var loadStores = inStores;
    var lastTimeStamp = lastTs;

    // Find and returns first datetime field from store
    getDateTimeFieldName = function (store) {
        var dateTimeFieldName = null;
        for (var ii = 0; ii < store.fields.length; ii++) {
            if (store.fields[ii].type == "datetime") {
                dateTimeFieldName = store.fields[ii].name;
                break;
            }
        }
        return dateTimeFieldName;
    };

    // Find and return all datetime fields in store
    getDateTimeFieldNames = function (stores) {
        var result = []
        for (var ii = 0; ii < stores.length; ii++) {
            var store = stores[ii];
            result.push(getDateTimeFieldName(store));
        }
        return result;
    };

    // Returns index with lowest timestamp value from currRecIdxs array
    findLowestRecIdx = function (currRecIdxs) {
        var min = Number.MAX_VALUE;
        var idx = -1;        

        for (var ii = 0; ii < currRecIdxs.length; ii++) {
            var currRec = loadRSets[ii][currRecIdxs[ii]];
            if (currRec == null) continue;
            if (currRec[dateTimeFields[ii]].timestamp < min) {
                min = currRec[dateTimeFields[ii]].timestamp;
                idx = ii;
                lastTimeStamp = min;
            }
        }        
        return idx;
    };

    // prepare time-windowed RSet from the store
    prepareRSet = function (store, startDateStr, endDateStr, lastTs) {
        // get measurements
        var rs = qm.search({
            "$from": store.name,
            "Date": [{ "$gt": String(startDateStr) }, { "$lt": String(endDateStr) }]
        });

        return rs;
    };

    // prepare time-windowed RSets from the stores
    prepareRSets = function (stores, startDate, endDate, lastTs) {
        var loadRSets = [];

        for (var ii = 0; ii < stores.length; ii++) {
            var store = stores[ii];
            loadRSets.push(prepareRSet(store, startDate, endDate, lastTs));
        }

        return loadRSets;
    }

    // index of current records in a recordset
    var currRecIdxs = [];
    for (var ii = 0; ii < loadStores.length; ii++) {
        currRecIdxs.push(0);
    }
    // detect date-time fields
    var dateTimeFields = getDateTimeFieldNames(loadStores);    
    // prepare recordsets
    loadRSets = prepareRSets(inStores, startDate, endDate);

    while (true) {
        var lowestRecIdx = findLowestRecIdx(currRecIdxs); 
        if (lowestRecIdx == -1) break;        

        // get next record
        var rec = loadRSets[lowestRecIdx][currRecIdxs[lowestRecIdx]];
        // console.log("\n" + lowestRecIdx);
        // console.log(" - " + currRecIdxs[lowestRecIdx]);
        var val = rec.toJSON(true);
        delete val.$id;        

        // making request to remote instance of QMiner
        var url = remoteURL + '?store=' + loadStores[lowestRecIdx].store + '&data=' + JSON.stringify(val);
        http.get(url);

        currRecIdxs[lowestRecIdx]++
    }

    console.log(lastTimeStamp);
    return lastTimeStamp;
}

// About this module
exports.about = function () {
    var description = "Imports data according to timestamp. Instore and outstore are input parameters.";
    return description;
};