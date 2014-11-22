//////////// AVERAGE VAL
exports.newAvrVal = function () {
    createAvr = function () {
        this.count = 0;
        this.avr = 0;

        this.update = function (val) {
            this.count++;
            this.avr = this.avr + (val - this.avr) / this.count;
            return this.avr;
        }

        this.predict = function () {
            return this.avr;
        }
    }
    return new createAvr();
}

//////////// MOVING AVERAGE VAL
exports.newMovAvrVal = function (n) {
    createAvr = function (n) {
        this.count = 0;
        this.sum = 0;
        this.size = n;
        this.arr = [];

        this.update = function (val) {
            this.count++;
            this.arr.push(val);
            this.sum += val;

            if (this.count > this.size) {
                this.count--;
                newVal = this.arr.shift();
                this.sum -= newVal;
            }

            this.avr = this.sum / this.count;

            return this.avr;
        }

        this.predict = function () {
            return this.avr;
        }
    }
    return new createAvr(n);
}

// About this module
exports.about = function () {
    var description = "Module with baseline predictions.";
    return description;
};