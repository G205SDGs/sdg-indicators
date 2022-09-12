var mapView = function () {

  "use strict";

  this.initialise = function(indicatorId, precision, precisionItems, decimalSeparator, thousandsSeparator, dataSchema, viewHelpers, modelHelpers, chartTitles, chartSubtitles) {
    $('.map').show();
    $('#map').sdgMap({
      indicatorId: indicatorId,
      mapOptions: {{ site.map_options | jsonify }},
      mapLayers: {{ site.map_layers | jsonify }},
      precision: precision,
      precisionItems: precisionItems,
      decimalSeparator: decimalSeparator,
      thousandsSeparator: thousandsSeparator,
      dataSchema: dataSchema,
      viewHelpers: viewHelpers,
      modelHelpers: modelHelpers,
      chartTitles: chartTitles,
      chartSubtitles: chartSubtitles,
    });
  };
};
