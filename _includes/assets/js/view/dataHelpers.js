/**
 * @param {null|undefined|Float|String} value
 * @param {Object} info
 * @param {Object} context
 * @param {Object} additionalInfo
 * @return {null|undefined|Float|String}
 */
function alterDataDisplay(value, info, context, additionalInfo) {
    // If value is empty, we will not alter it.
    if (value == null || value == undefined) {
        return value;
    }
    // Before passing to user-defined dataDisplayAlterations, let's
    // do our best to ensure that it starts out as a number.
    var altered = value;
    var obsText = '';
    if (typeof altered !== 'number') {
        if (typeof altered == 'string' && context === 'table cell' && altered.indexOf(' ') > 0) {
            obsText = altered.substring(altered.indexOf(' ') + 1);
            altered = Number(altered.substring(0, altered.indexOf(' ')));
        }
        else {
            altered = Number(value);
        }
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
    };
    // If the returned value is not a number, use the legacy logic for
    // precision and decimal separator.
    if (typeof altered !== 'number') {
        // Now apply our custom precision control if needed.

        if (precision || precision === 0) {
            altered = Number.parseFloat(altered).toFixed(precision);
        }
        // Now apply our custom decimal separator if needed.
        if (OPTIONS.decimalSeparator) {
            altered = altered.toString().replace('.', OPTIONS.decimalSeparator);
        }
        // Apply thousands seperator if needed
        if (OPTIONS.thousandsSeparator && precision <=3){
            altered = altered.toString().replace(/\B(?=(\d{3})+(?!\d))/g, OPTIONS.thousandsSeparator);
        }
    }

    // Otherwise if we have a number, use toLocaleString instead.
    else {
        var localeOpts = {};
        if (VIEW._precision || VIEW._precision === 0) {
            localeOpts.minimumFractionDigits = precision;
            localeOpts.maximumFractionDigits = precision;
        }
        altered = altered.toLocaleString(opensdg.language, localeOpts);
        // Apply thousands seperator if needed
        if (OPTIONS.thousandsSeparator && precision <=3 && opensdg.language == 'de'){
            altered = altered.replaceAll('.', OPTIONS.thousandsSeparator);
        }
    }
    // Now let's add any footnotes from observation attributes.
    var obsAttributes = [];
    if (context === 'chart tooltip') {
        var dataIndex = additionalInfo.dataIndex;
        obsAttributes = info.observationAttributes[dataIndex];
    }
    else if (context === 'table cell') {
        var row = additionalInfo.row,
            col = additionalInfo.col,
            obsAttributesTable = additionalInfo.observationAttributesTable;
        obsAttributes = obsAttributesTable.data[row][col];
        //altered += ' ' + obsText;
    }
    if (obsAttributes.length > 0) {
        var obsAttributeFootnoteNumbers = obsAttributes.map(function(obsAttribute) {
          return getObservationAttributeFootnoteSymbol(obsAttribute);
        });
        // if (context == 'table cell'){
        //   obsAttributeFootnoteNumbers.splice(obsAttributeFootnoteNumbers.indexOf('0'),1);
        // }
        var attributes = ' [' + obsAttributeFootnoteNumbers.join(', ') + ']';
    }
    else {
      var attributes = '';
    }

    // for table: we do not want "0 [-]" but "-"; and not "0,00 [0]" but "0,00"
    if (context == 'table cell'){
      if (parseFloat(altered) == 0){
        // case: "0"
        if (attributes.indexOf('0') > -1) {
          var deci = ['0', '0.0', '0.00', '0.000']
          for (var i = 0; i < deci.length; i++) {
            attributes = attributes.replace('[' + deci[i] + ']','').replace('' + deci[i] + ', ','').replace(', ' + deci[i] + '','');
          }
        }
        else if (attributes.indexOf('‒') > -1){
          altered = '‒';
          attributes = attributes.replace('[‒]','').replace('‒, ','').replace(', ‒','');
        }
      }
    }
    altered += attributes;

    return altered;
}

/**
 * Convert a number into a string for observation atttribute footnotes.
 *
 * @param {int} num
 * @returns {string} Number converted into unicode character for footnotes.
 */
function getObservationAttributeFootnoteSymbol(obsAttribute) {
    // make sure we do not get 0.000 for obsValue
    if (isNaN(parseInt(obsAttribute.value))) {
        return '' + obsAttribute.value + '';
    }
    else{
        return '' + String(parseInt(obsAttribute.value)) + '';
    }

    //return '[' + translations.indicator.note + ' ' + (num + 1) + ']';
}
