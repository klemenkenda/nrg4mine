// ---------------------------------------------------------------------------
// FILE: pushData.js
// AUTHOR: Blaz Kazic (IJS), Klemen Kenda (IJS)
// DATE: 2014-09-01
// DESCRIPTION:
//   Pushing data from one QMiner instance to another.
// ---------------------------------------------------------------------------
// HISTORY:
// ---------------------------------------------------------------------------

exports.pushData = function (inStores, startDate, remoteURL, lastTs, maxitems) {
    var loadStores = inStores;
    var lastTimeStamp = lastTs;

    console.log("Ts - " + lastTs);
    console.log("Date - " + startDate);
    console.log("URL - " + remoteURL);


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
            // it only pushes until the first table is empty (?check!)
            // which is a feature, as data is loaded unsynchronously
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
    prepareRSet = function (store, startDateStr, lastTs) {
        // get measurements
        var rs = qm.search({
            "$from": store.name,
            "Date": [{ "$gt": String(startDateStr) }]
        });

        return rs;
    };

    // prepare time-windowed RSets from the stores
    prepareRSets = function (stores, startDate, lastTs) {
        var loadRSets = [];

        for (var ii = 0; ii < stores.length; ii++) {
            var store = stores[ii];
            loadRSets.push(prepareRSet(store, startDate, lastTs));
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
    loadRSets = prepareRSets(inStores, startDate, lastTs);

    var i = 0;  // counter of insertions
    var n = 0;  // failsafe counter

    while ((i < maxitems) && (n < 10000000)) {
        n++;
        var lowestRecIdx = findLowestRecIdx(currRecIdxs); 
        if (lowestRecIdx == -1) break;        

        // get next record
        var rec = loadRSets[lowestRecIdx][currRecIdxs[lowestRecIdx]];
        // console.log("\n" + lowestRecIdx);
        // console.log(" - " + currRecIdxs[lowestRecIdx]);
        var val = rec.toJSON(true);
        delete val.$id;        
        
        // making request to remote instance of QMiner             
        if (lastTimeStamp > lastTs) {
            i++;
            var url = remoteURL + '?store=' + loadStores[lowestRecIdx].name + '&data=' + JSON.stringify(val);
            http.get(url);
        }

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