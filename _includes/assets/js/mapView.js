var mapView = function () {

  "use strict";

  this.initialise = function(indicatorId, precision, decimalSeparator, goalNr) {
    $('.map').show();
    $('#map').sdgMap({
      indicatorId: indicatorId,
      mapOptions: {{ site.map_options | jsonify }},
      mapLayers: {{ site.map_layers | jsonify }},
      precision: precision,
      decimalSeparator: decimalSeparator,
      goal: goalNr,
    });
  };
};
