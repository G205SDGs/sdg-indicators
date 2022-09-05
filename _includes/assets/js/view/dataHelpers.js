/**
 * @param {null|undefined|Float|String} value
 * @param {Object} info
 * @param {Object} context
 * @return {null|undefined|Float|String}
 */
function alterDataDisplay(value, info, context) {
    // If value is empty, we will not alter it.
    if (value == null || value == undefined) {
        return value;
    }
    // Before passing to user-defined dataDisplayAlterations, let's
    // do our best to ensure that it starts out as a number.
    var altered = value;
    if (typeof altered !== 'number') {
        altered = Number(value);
    }
    // If that gave us a non-number, return original.
    if (isNaN(altered)) {
        return value;
    }
    // Now go ahead with user-defined alterations.
    opensdg.dataDisplayAlterations.forEach(function (callback) {
        altered = callback(altered, info, context);
    });
    // Now apply our custom precision control if needed.

    // Special treatment for numbers on y axis: If stepSize is defined, they should display decimal places as follows:
    // StepSize >= 1 --> 0 decimal places, Stepsize >= 0.1 --> 1 decimal place, StepSize >= 0.01 --> 2 decimal places ...
    if (context == 'chart y-axis tick' && VIEW._graphStepsize && VIEW.graphStepsize != 0 && VIEW.graphStepsize != '') {
      precision = Math.ceil(Math.log(1 / VIEW._graphStepsize.step) / Math.LN10);
      if (precision < 0) {
        precision = 0
      }
    }
    else {
      var precision = VIEW._precision
    }
    if (precision || precision === 0) {
        altered = Number.parseFloat(altered).toFixed(precision);
    }
    // Now apply our custom decimal separator if needed.
    if (OPTIONS.decimalSeparator) {
        altered = altered.toString().replace('.', OPTIONS.decimalSeparator);
    }
    // Apply thousands seperator if needed
    if (OPTIONS.thousandsSeparator){
        altered = altered.toString().replace(/\B(?=(\d{3})+(?!\d))/g, OPTIONS.thousandsSeparator);
    }

    return altered;
}
