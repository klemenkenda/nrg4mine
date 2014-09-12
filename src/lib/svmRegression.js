////////////// ONLINE SVM REGRESSION 
function svmRegression(dim, parameters, buffer) {
    var X = [];
    var y = [];
    this.parameters = parameters;
    var buffer = typeof buffer !== 'undefined' ? buffer : -1;
    var matrix;
    var targetVec;

    this.add = function (x, target) {
        X.push(x);
        y.push(target);
        if (buffer > 0) {
            if (X.length > buffer) {
                forget(X.length - buffer);
            }
        }
    };

    this.getMatrix = function () {
        if (X.length > 0) {
            var A = la.newMat({ "cols": X[0].length, "rows": X.length });
            for (var i = 0; i < X.length; i++) {
                A.setRow(i, X[i]);
            }
            return A;
        }
    };

    this.getColMatrix = function () {
        if (X.length > 0) {
            var A = la.newMat({ "cols": X.length, "rows": X[0].length });
            for (var i = 0; i < X.length; i++) {
                A.setCol(i, X[i]);
            }
            return A;
        }
    };

    this.getTargetVec = function () {
        return la.copyFltArrayToVec(y);
    }

    this.update = function () {
        matrix = this.getColMatrix();
        targetVec = this.getTargetVec();
        //matrix = matrix.sparse();
        this.model = analytics.trainSvmRegression(matrix, targetVec, this.parameters);
    }

    this.learn = function (learnMat, targetVec) {
        this.add(learnMat, targetVec);
        this.update();
    }

    this.predict = function (vec) {
        //vec.print()
        var result = this.model.predict(vec);
        return result;
    }

    // initialize model
    var initModel = function (dim) {
        matrix = la.newMat({ "rows": dim, "cols": 1 });
        targetVec = la.newVec({ "vals": 1 })
        return analytics.trainSvmRegression(matrix, targetVec);
    }

    // forget function
    var forget = function (ndeleted) {
        ndeleted = typeof ndeleted !== 'undefined' ? ndeleted : 1;
        ndeleted = Math.min(X.length, ndeleted);
        X.splice(0, ndeleted);
        y.splice(0, ndeleted);
    };

    this.model = initModel(dim);
    return this;
}

// Exposed method to creates new instance of svmr object
exports.newSvmRegression = function (dim, parameters, buffer) {
    return new svmRegression(dim, parameters, buffer);
}

// About this module
exports.about = function () {
    var description = "New (fake) online SVM regression method.";
    return description;
};