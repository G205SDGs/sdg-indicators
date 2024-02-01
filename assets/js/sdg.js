/**
 * This function returns a javascript object containing autotrack.js properties.
 *
 * These properties can be added to an element with jQuery: $(element).attr(props)
 *
 * See _includes/autotrack.html for parameter descriptions.
 */
opensdg.autotrack = function(preset, category, action, label) {
  var presets = {};var params = {
    category: category,
    action: action,
    label: label
  };
  if (presets[preset]) {
    params = presets[preset];
  }
  var obj = {
    'data-on': 'click'
  };
  if (params.category) {
    obj['data-event-category'] = params.category;
  }
  if (params.action) {
    obj['data-event-action'] = params.action;
  }
  if (params.label) {
    obj['data-event-label'] = params.label;
  }

  return obj;
};
/**
 * TODO:
 * Integrate with high-contrast switcher.
 */
(function($) {

  if (typeof L === 'undefined') {
    return;
  }

  // Create the defaults once
  var defaults = {

    // Options for using tile imagery with leaflet.
    tileURL: '[replace me]',
    tileOptions: {
      id: '[relace me]',
      accessToken: '[replace me]',
      attribution: '[replace me]',
    },
    // Zoom limits.
    minZoom: 5,
    maxZoom: 10,
    // Visual/choropleth considerations.
    colorRange: chroma.brewer.BuGn,
    noValueColor: '#66f0f0f0',
    styleNormal: {
      weight: 1,
      opacity: 1,
      color: '#888888',
      fillOpacity: 0.7
    },
    styleHighlighted: {
      weight: 1,
      opacity: 1,
      color: '#111111',
      fillOpacity: 0.7
    },
    styleStatic: {
      weight: 2,
      opacity: 1,
      fillOpacity: 0,
      color: '#172d44',
      dashArray: '5,5',
    },
  };

  // Defaults for each map layer.
  var mapLayerDefaults = {
    min_zoom: 0,
    max_zoom: 10,
    subfolder: 'regions',
    label: 'indicator.map',
    staticBorders: false,
  };

  function Plugin(element, options) {

    this.element = element;

    // Support colorRange map option in string format.
    if (typeof options.mapOptions.colorRange === 'string') {
      var colorRangeParts = options.mapOptions.colorRange.split('.'),
          colorRange = window,
          overrideColorRange = true;
      for (var i = 0; i < colorRangeParts.length; i++) {
        var colorRangePart = colorRangeParts[i];
        if (typeof colorRange[colorRangePart] !== 'undefined') {
          colorRange = colorRange[colorRangePart];
        }
        else {
          overrideColorRange = false;
          break;
        }
      }
      options.mapOptions.colorRange = (overrideColorRange) ? colorRange : defaults.colorRange;
    }

    // Support multiple colorsets
    if (Array.isArray(options.mapOptions.colorRange[0])) {
      this.goalNumber = parseInt(options.indicatorId.slice(options.indicatorId.indexOf('_')+1,options.indicatorId.indexOf('-')));
      options.mapOptions.colorRange = options.mapOptions.colorRange[this.goalNumber-1];
      console.log("goal: ",this.goalNumber);
    }


    this.options = $.extend(true, {}, defaults, options.mapOptions);
    this.mapLayers = [];
    this.indicatorId = options.indicatorId;
    this._precision = options.precision;
    this.precisionItems = options.precisionItems;
    this._decimalSeparator = options.decimalSeparator;
    this._thousandsSeparator = options.thousandsSeparator;
    this.currentDisaggregation = 0;
    this.dataSchema = options.dataSchema;
    this.viewHelpers = options.viewHelpers;
    this.modelHelpers = options.modelHelpers;
    this.chartTitles = options.chartTitles;
    this.chartSubtitles = options.chartSubtitles;
    this.proxy = options.proxy;
    this.proxySerieses = options.proxySerieses;
    this.startValues = options.startValues;

    // Require at least one geoLayer.
    if (!options.mapLayers || !options.mapLayers.length) {
      console.log('Map disabled - please add "map_layers" in site configuration.');
      return;
    }

    // Apply geoLayer defaults.
    for (var i = 0; i < options.mapLayers.length; i++) {
      this.mapLayers[i] = $.extend(true, {}, mapLayerDefaults, options.mapLayers[i]);
    }

    // Sort the map layers according to zoom levels.
    this.mapLayers.sort(function(a, b) {
      if (a.min_zoom === b.min_zoom) {
        return a.max_zoom - b.max_zoom;
      }
      return a.min_zoom - b.min_zoom;
    });

    this._defaults = defaults;
    this._name = 'sdgMap';

    this.init();
  }

  Plugin.prototype = {

    // Update title.
    updateTitle: function() {
      if (!this.modelHelpers) {
        return;
      }
      var currentSeries = this.disaggregationControls.getCurrentSeries(),
          currentUnit = this.disaggregationControls.getCurrentUnit(),
          newTitle = null;
          newSubtitle = null;
      if (this.modelHelpers.GRAPH_TITLE_FROM_SERIES) {
        newTitle = currentSeries;
      }
      else {
        var currentTitle = $('#map-heading').text();
        var currentSubtitle = $('#map-subheading').text();
        newTitle = this.modelHelpers.getChartTitle(currentTitle, this.chartTitles, currentUnit, currentSeries);
        newSubtitle = this.modelHelpers.getChartTitle(currentSubtitle, this.chartSubtitles, currentUnit, currentSeries);
      }
      if (newTitle) {
        if (this.proxy === 'proxy' || this.proxySerieses.includes(currentSeries)) {
            newTitle += ' ' + this.viewHelpers.PROXY_PILL;
        }
        $('#map-heading').html(newTitle);
      }
      if (newSubtitle) {
        $('#map-subheading').text(newSubtitle);
      }
    },

    // Update footer fields.
    updateFooterFields: function() {
      if (!this.viewHelpers) {
        return;
      }
      var currentSeries = this.disaggregationControls.getCurrentSeries(),
          currentUnit = this.disaggregationControls.getCurrentUnit();
      this.viewHelpers.updateSeriesAndUnitElements(currentSeries, currentUnit);
      this.viewHelpers.updateUnitElements(currentUnit);
    },

    // Update precision.
    updatePrecision: function() {
      if (!this.modelHelpers) {
        return;
      }
      var currentSeries = this.disaggregationControls.getCurrentSeries(),
          currentUnit = this.disaggregationControls.getCurrentUnit();
      this._precision = this.modelHelpers.getPrecision(this.precisionItems, currentUnit, currentSeries);
    },

    // Zoom to a feature.
    zoomToFeature: function(layer) {
      this.map.fitBounds(layer.getBounds());
    },

    // Build content for a tooltip.
    getTooltipContent: function(feature) {
      var tooltipContent = feature.properties.name;
      var tooltipData = this.getData(feature.properties);
      if (typeof tooltipData === 'number') {
        tooltipContent += ': ' + this.alterData(tooltipData);
      }
      return tooltipContent;
    },

    // Update a tooltip.
    updateTooltip: function(layer) {
      if (layer.getTooltip()) {
        var tooltipContent = this.getTooltipContent(layer.feature);
        layer.setTooltipContent(tooltipContent);
      }
    },

    // Create tooltip.
    createTooltip: function(layer) {
      if (!layer.getTooltip()) {
        var tooltipContent = this.getTooltipContent(layer.feature);
        layer.bindTooltip(tooltipContent, {
          permanent: true,
        }).addTo(this.map);
      }
    },

    // Select a feature.
    highlightFeature: function(layer) {
      // Abort if the layer is not on the map.
      if (!this.map.hasLayer(layer)) {
        return;
      }
      // Update the style.
      layer.setStyle(this.options.styleHighlighted);
      // Add a tooltip if not already there.
      this.createTooltip(layer);
      if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        layer.bringToFront();
      }
      this.updateStaticLayers();
    },

    // Unselect a feature.
    unhighlightFeature: function(layer) {

      // Reset the feature's style.
      layer.setStyle(this.options.styleNormal);

      // Remove the tooltip if necessary.
      if (layer.getTooltip()) {
        layer.unbindTooltip();
      }

      // Make sure other selections are still highlighted.
      var plugin = this;
      this.selectionLegend.selections.forEach(function(selection) {
        plugin.highlightFeature(selection);
      });
    },

    // Get all of the GeoJSON layers.
    getAllLayers: function() {
      return L.featureGroup(this.dynamicLayers.layers);
    },

    // Get only the visible GeoJSON layers.
    getVisibleLayers: function() {
      // Unfortunately relies on an internal of the ZoomShowHide library.
      return this.dynamicLayers._layerGroup;
    },

    updateStaticLayers: function() {
      // Make sure the static borders are always visible.
      this.staticLayers._layerGroup.eachLayer(function(layer) {
        layer.bringToFront();
      });
    },

    // Update the colors of the Features on the map.
    updateColors: function() {
      var plugin = this;
      this.getAllLayers().eachLayer(function(layer) {
        layer.setStyle(function(feature) {
          return {
            fillColor: plugin.getColor(feature.properties),
          }
        });
      });
    },

    // Update the tooltips of the selected Features on the map.
    updateTooltips: function() {
      var plugin = this;
      this.selectionLegend.selections.forEach(function(selection) {
        plugin.updateTooltip(selection);
      });
    },

    // Alter data before displaying it.
    alterData: function(value) {
      opensdg.dataDisplayAlterations.forEach(function(callback) {
        value = callback(value);
      });
      if (this._precision || this._precision === 0) {
        value = Number.parseFloat(value).toFixed(this._precision);
      }
      if (this._decimalSeparator) {
        value = value.toString().replace('.', this._decimalSeparator);
      }
      if (this._thousandsSeparator) {
        value = value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, this._thousandsSeparator);
      }
      return value;
    },

    // Get the data from a feature's properties, according to the current year.
    getData: function(props) {
      var ret = false;
      if (props.values && props.values.length && this.currentDisaggregation < props.values.length) {
        var value = props.values[this.currentDisaggregation][this.currentYear];
        if (typeof value === 'number') {
          ret = opensdg.dataRounding(value, { indicatorId: this.indicatorId });
        }
      }
      return ret;
    },

    // Choose a color for a GeoJSON feature.
    getColor: function(props) {
      var data = this.getData(props);
      if (data) {
        return this.colorScale(data).hex();
      }
      else {
        return this.options.noValueColor;
      }
    },

    // Set (or re-set) the choropleth color scale.
    setColorScale: function() {
      this.colorScale = chroma.scale(this.options.colorRange)
        .domain(this.valueRanges[this.currentDisaggregation])
        .classes(this.options.colorRange.length);
    },

    // Get the (long) URL of a geojson file, given a particular subfolder.
    getGeoJsonUrl: function(subfolder) {
      var fileName = this.indicatorId + '.geojson';
      return [opensdg.remoteDataBaseUrl, 'geojson', subfolder, fileName].join('/');
    },

    getYearSlider: function() {
      var plugin = this,
          years = plugin.years[plugin.currentDisaggregation];
      return L.Control.yearSlider({
        years: years,
        yearChangeCallback: function(e) {
          plugin.currentYear = years[e.target._currentTimeIndex];
          plugin.updateColors();
          plugin.updateTooltips();
          plugin.selectionLegend.update();
        }
      });
    },

    replaceYearSlider: function() {
      var newSlider = this.getYearSlider();
      var oldSlider = this.yearSlider;
      this.map.addControl(newSlider);
      this.map.removeControl(oldSlider);
      this.yearSlider = newSlider;
      $(this.yearSlider.getContainer()).insertAfter($(this.disaggregationControls.getContainer()));
      this.yearSlider._timeDimension.setCurrentTimeIndex(this.yearSlider._timeDimension.getCurrentTimeIndex());
    },

    // Initialize the map itself.
    init: function() {

      // Create the map.
      this.map = L.map(this.element, {
        minZoom: this.options.minZoom,
        maxZoom: this.options.maxZoom,
        zoomControl: false,
      });
      this.map.setView([0, 0], 0);
      this.dynamicLayers = new ZoomShowHide();
      this.dynamicLayers.addTo(this.map);
      this.staticLayers = new ZoomShowHide();
      this.staticLayers.addTo(this.map);

      // Add scale.
      this.map.addControl(L.control.scale({position: 'bottomright'}));

      // Add tile imagery.
      if (this.options.tileURL && this.options.tileURL !== 'undefined' && this.options.tileURL != '') {
        L.tileLayer(this.options.tileURL, this.options.tileOptions).addTo(this.map);
      }

      // Because after this point, "this" rarely works.
      var plugin = this;

      // Below we'll be figuring out the min/max values and available years.
      var minimumValues = [],
          maximumValues = [],
          availableYears = [];

      // At this point we need to load the GeoJSON layer/s.
      var geoURLs = this.mapLayers.map(function(item) {
        return $.getJSON(plugin.getGeoJsonUrl(item.subfolder));
      });
      $.when.apply($, geoURLs).done(function() {

        // Apparently "arguments" can either be an array of responses, or if
        // there was only one response, the response itself. This behavior is
        // odd and should be investigated. In the meantime, a workaround is a
        // blunt check to see if it is a single response.
        var geoJsons = arguments;
        // In a response, the second element is a string (like 'success') so
        // check for that here to identify whether it is a response.
        if (arguments.length > 1 && typeof arguments[1] === 'string') {
          // If so, put it into an array, to match the behavior when there are
          // multiple responses.
          geoJsons = [geoJsons];
        }

        // Do a quick loop through to see which layers actually have data.
        for (var i = 0; i < geoJsons.length; i++) {
          var layerHasData = true;
          if (typeof geoJsons[i][0].features === 'undefined') {
            layerHasData = false;
          }
          else if (!plugin.featuresShouldDisplay(geoJsons[i][0].features)) {
            layerHasData = false;
          }
          if (layerHasData === false) {
            // If a layer has no data, we'll be skipping it.
            plugin.mapLayers[i].skipLayer = true;
            // We also need to alter a sibling layer's min_zoom or max_zoom.
            var hasLayerBefore = i > 0;
            var hasLayerAfter = i < (geoJsons.length - 1);
            if (hasLayerBefore) {
              plugin.mapLayers[i - 1].max_zoom = plugin.mapLayers[i].max_zoom;
            }
            else if (hasLayerAfter) {
              plugin.mapLayers[i + 1].min_zoom = plugin.mapLayers[i].min_zoom;
            }
          }
          else {
            plugin.mapLayers[i].skipLayer = false;
          }
        }

        for (var i = 0; i < geoJsons.length; i++) {
          if (plugin.mapLayers[i].skipLayer) {
            continue;
          }
          // First add the geoJson as static (non-interactive) borders.
          if (plugin.mapLayers[i].staticBorders) {
            var staticLayer = L.geoJson(geoJsons[i][0], {
              style: plugin.options.styleStatic,
              interactive: false,
            });
            // Static layers should start appear when zooming past their dynamic
            // layer, and stay visible after that.
            staticLayer.min_zoom = plugin.mapLayers[i].max_zoom + 1;
            staticLayer.max_zoom = plugin.options.maxZoom;
            plugin.staticLayers.addLayer(staticLayer);
          }
          // Now go on to add the geoJson again as choropleth dynamic regions.
          var geoJson = geoJsons[i][0]
          var layer = L.geoJson(geoJson, {
            style: plugin.options.styleNormal,
            onEachFeature: onEachFeature,
          });
          // Set the "boundaries" for when this layer should be zoomed out of.
          layer.min_zoom = plugin.mapLayers[i].min_zoom;
          layer.max_zoom = plugin.mapLayers[i].max_zoom;
          // Listen for when this layer gets zoomed in or out of.
          layer.on('remove', zoomOutHandler);
          layer.on('add', zoomInHandler);
          // Save the GeoJSON object for direct access (download) later.
          layer.geoJsonObject = geoJson;
          // Add the layer to the ZoomShowHide group.
          plugin.dynamicLayers.addLayer(layer);

          // Add a download button below the map.
          var downloadLabel = translations.t(plugin.mapLayers[i].label)
          var downloadButton = $('<a></a>')
            .attr('href', plugin.getGeoJsonUrl(plugin.mapLayers[i].subfolder))
            .attr('download', '')
            .attr('class', 'btn btn-primary btn-download')
            .attr('title', translations.indicator.download_geojson_title + ' - ' + downloadLabel)
            .attr('aria-label', translations.indicator.download_geojson_title + ' - ' + downloadLabel)
            .text(translations.indicator.download_geojson + ' - ' + downloadLabel);
          $(plugin.element).parent().append(downloadButton);

          // Keep track of the minimums and maximums.
          _.each(geoJson.features, function(feature) {
            if (feature.properties.values && feature.properties.values.length > 0) {
              for (var valueIndex = 0; valueIndex < feature.properties.values.length; valueIndex++) {
                var validEntries = _.reject(Object.entries(feature.properties.values[valueIndex]), function(entry) {
                  return isMapValueInvalid(entry[1]);
                });
                var validKeys = validEntries.map(function(entry) {
                  return entry[0];
                });
                var validValues = validEntries.map(function(entry) {
                  return entry[1];
                });
                if (availableYears.length <= valueIndex) {
                  availableYears.push([]);
                }
                availableYears[valueIndex] = availableYears[valueIndex].concat(validKeys);
                if (minimumValues.length <= valueIndex) {
                  minimumValues.push([]);
                  maximumValues.push([]);
                }
                minimumValues[valueIndex].push(_.min(validValues));
                maximumValues[valueIndex].push(_.max(validValues));
              }
            }
          });
        }

        // Calculate the ranges of values, years and colors.
        function isMapValueInvalid(val) {
          return _.isNaN(val) || val === '';
        }

        plugin.valueRanges = [];
        for (var valueIndex = 0; valueIndex < minimumValues.length; valueIndex++) {
          minimumValues[valueIndex] = _.reject(minimumValues[valueIndex], isMapValueInvalid);
          maximumValues[valueIndex] = _.reject(maximumValues[valueIndex], isMapValueInvalid);
          plugin.valueRanges[valueIndex] = [_.min(minimumValues[valueIndex]), _.max(maximumValues[valueIndex])];
        }
        plugin.setColorScale();

        plugin.years = availableYears.map(function(yearsForIndex) {
          return _.uniq(yearsForIndex).sort();
        });
        //Start the map with the most recent year
        plugin.currentYear = plugin.years[plugin.currentDisaggregation].slice(-1)[0];
        plugin.currentYear = plugin.years.slice(-1)[0];

        // And we can now update the colors.
        plugin.updateColors();

        // Add zoom control.
        plugin.zoomHome = L.Control.zoomHome({
          zoomInTitle: translations.indicator.map_zoom_in,
          zoomOutTitle: translations.indicator.map_zoom_out,
          zoomHomeTitle: translations.indicator.map_zoom_home,
        });
        plugin.map.addControl(plugin.zoomHome);

        // Add full-screen functionality.
        plugin.map.addControl(new L.Control.FullscreenAccessible({
          title: {
              'false': translations.indicator.map_fullscreen,
              'true': translations.indicator.map_fullscreen_exit,
          },
        }));

        // Add the year slider.
        plugin.yearSlider = plugin.getYearSlider();
        plugin.map.addControl(plugin.yearSlider);

        // Add the selection legend.
        plugin.selectionLegend = L.Control.selectionLegend(plugin);
        plugin.map.addControl(plugin.selectionLegend);

        // Add the disaggregation controls.
        plugin.disaggregationControls = L.Control.disaggregationControls(plugin);
        plugin.map.addControl(plugin.disaggregationControls);
        if (plugin.disaggregationControls.needsMapUpdate) {
          plugin.disaggregationControls.updateMap();
        }
        else {
          plugin.updateTitle();
          plugin.updateFooterFields();
          plugin.updatePrecision();
        }

        // Add the search feature.
        plugin.searchControl = new L.Control.SearchAccessible({
          textPlaceholder: 'Search map',
          autoCollapseTime: 7000,
          layer: plugin.getAllLayers(),
          propertyName: 'name',
          marker: false,
          moveToLocation: function(latlng) {
            plugin.zoomToFeature(latlng.layer);
            if (!plugin.selectionLegend.isSelected(latlng.layer)) {
              plugin.highlightFeature(latlng.layer);
              plugin.selectionLegend.addSelection(latlng.layer);
            }
          },
        });
        plugin.map.addControl(plugin.searchControl);
        // The search plugin messes up zoomShowHide, so we have to reset that
        // with this hacky method. Is there a better way?
        var zoom = plugin.map.getZoom();
        plugin.map.setZoom(plugin.options.maxZoom);
        plugin.map.setZoom(zoom);

        // Hide the loading image.
        $('.map-loading-image').hide();
        // Make the map unfocusable.
        $('#map').removeAttr('tabindex');

        // The list of handlers to apply to each feature on a GeoJson layer.
        function onEachFeature(feature, layer) {
          if (plugin.featureShouldDisplay(feature)) {
            layer.on('click', clickHandler);
            layer.on('mouseover', mouseoverHandler);
            layer.on('mouseout', mouseoutHandler);
          }
        }
        // Event handler for click/touch.
        function clickHandler(e) {
          var layer = e.target;
          if (plugin.selectionLegend.isSelected(layer)) {
            plugin.selectionLegend.removeSelection(layer);
            plugin.unhighlightFeature(layer);
          }
          else {
            plugin.selectionLegend.addSelection(layer);
            plugin.highlightFeature(layer);
            plugin.zoomToFeature(layer);
          }
        }
        // Event handler for mouseover.
        function mouseoverHandler(e) {
          var layer = e.target;
          if (!plugin.selectionLegend.isSelected(layer)) {
            plugin.highlightFeature(layer);
          }
        }
        // Event handler for mouseout.
        function mouseoutHandler(e) {
          var layer = e.target;
          if (!plugin.selectionLegend.isSelected(layer)) {
            plugin.unhighlightFeature(layer);
          }
        }
        // Event handler for when a geoJson layer is zoomed out of.
        function zoomOutHandler(e) {
          var geoJsonLayer = e.target;
          // For desktop, we have to make sure that no features remain
          // highlighted, as they might have been highlighted on mouseover.
          geoJsonLayer.eachLayer(function(layer) {
            if (!plugin.selectionLegend.isSelected(layer)) {
              plugin.unhighlightFeature(layer);
            }
          });
          plugin.updateStaticLayers();
          if (plugin.disaggregationControls) {
            plugin.disaggregationControls.update();
          }
        }
        // Event handler for when a geoJson layer is zoomed into.
        function zoomInHandler(e) {
          plugin.updateStaticLayers();
          if (plugin.disaggregationControls) {
            plugin.disaggregationControls.update();
          }
        }
      });

      // Certain things cannot be done until the map is visible. Because our
      // map is in a tab which might not be visible, we have to postpone those
      // things until it becomes visible.
      if ($('#map').is(':visible')) {
        finalMapPreparation();
      }
      else {
        $('#tab-mapview').parent().click(finalMapPreparation);
      }
      function finalMapPreparation() {
        // Update the series/unit stuff in case it changed
        // while on the chart/table.
        plugin.updateTitle();
        plugin.updateFooterFields();
        plugin.updatePrecision();
        // The year slider does not seem to be correct unless we refresh it here.
        plugin.yearSlider._timeDimension.setCurrentTimeIndex(plugin.yearSlider._timeDimension.getCurrentTimeIndex());
        // Delay other things to give time for browser to do stuff.
        setTimeout(function() {
          $('#map #loader-container').hide();
          // Leaflet needs "invalidateSize()" if it was originally rendered in a
          // hidden element. So we need to do that when the tab is clicked.
          plugin.map.invalidateSize();
          // Also zoom in/out as needed.
          plugin.map.fitBounds(plugin.getVisibleLayers().getBounds());
          // Set the home button to return to that zoom.
          plugin.zoomHome.setHomeBounds(plugin.getVisibleLayers().getBounds());
          // Limit the panning to what we care about.
          plugin.map.setMaxBounds(plugin.getVisibleLayers().getBounds());
          // Make sure the info pane is not too wide for the map.
          var $legendPane = $('.selection-legend.leaflet-control');
          var widthPadding = 20;
          var maxWidth = $('#map').width() - widthPadding;
          if ($legendPane.width() > maxWidth) {
            $legendPane.width(maxWidth);
          }
          // Make sure the map is not too high.
          var heightPadding = 75;
          var minHeight = 400;
          var maxHeight = $(window).height() - heightPadding;
          if (maxHeight < minHeight) {
            maxHeight = minHeight;
          }
          if ($('#map').height() > maxHeight) {
            $('#map').height(maxHeight);
          }
        }, 500);
      };
    },

    featureShouldDisplay: function(feature) {
      var display = true;
      display = display && typeof feature.properties.name !== 'undefined';
      display = display && typeof feature.properties.geocode !== 'undefined';
      display = display && typeof feature.properties.values !== 'undefined';
      display = display && typeof feature.properties.disaggregations !== 'undefined';
      return display;
    },

    featuresShouldDisplay: function(features) {
      for (var i = 0; i < features.length; i++) {
        if (this.featureShouldDisplay(features[i])) {
          return true;
        }
      }
      return false;
    }
  };

  // A really lightweight plugin wrapper around the constructor,
  // preventing against multiple instantiations
  $.fn['sdgMap'] = function(options) {
    return this.each(function() {
      if (!$.data(this, 'plugin_sdgMap')) {
        $.data(this, 'plugin_sdgMap', new Plugin(this, options));
      }
    });
  };
})(jQuery);
// This "crops" the charts so that empty years are not displayed
// at the beginning or end of each dataset. This ensures that the
// chart will fill all the available space.
Chart.register({
  id: 'rescaler',
  beforeInit: function (chart, options) {
    chart.config.data.allLabels = chart.config.data.labels.slice(0);
  },
  afterDatasetsUpdate: function (chart) {
    _.each(chart.data.datasets, function (ds) {
      if (!ds.initialised) {
        ds.initialised = true;
        ds.allData = ds.data.slice(0);
      }
    });
  },
  afterUpdate: function (chart) {

    // Ensure this only runs once.
    if (chart.isScaleUpdate) {
      chart.isScaleUpdate = false;
      return;
    }

    // For each dataset, create an object showing the
    // index of the minimum value and the index of the
    // maximum value (not counting empty/null values).
    var ranges = _.chain(chart.data.datasets).map('allData').map(function (data) {
      return {
        min: _.findIndex(data, function(val) { return val !== null }),
        max: _.findLastIndex(data, function(val) { return val !== null })
      };
    }).value();

    // Figure out the overal minimum and maximum
    // considering all of the datasets.
    var dataRange = ranges.length ? {
      min: _.chain(ranges).map('min').min().value(),
      max: _.chain(ranges).map('max').max().value()
    } : undefined;

    if (dataRange) {
      // "Crop" the labels according to the min/max.
      chart.data.labels = chart.data.allLabels.slice(dataRange.min, dataRange.max + 1);

      // "Crop" the data of each dataset according to the min/max.
      chart.data.datasets.forEach(function (dataset) {
        dataset.data = dataset.allData.slice(dataRange.min, dataRange.max + 1);
      });

      chart.isScaleUpdate = true;
      chart.update();
    }
  }
});
function getTextLinesOnCanvas(ctx, text, maxWidth) {
  var words = text.split(" ");
  var lines = [];
  var currentLine = words[0];

  for (var i = 1; i < words.length; i++) {
      var word = words[i];
      var width = ctx.measureText(currentLine + " " + word).width;
      if (width < maxWidth) {
          currentLine += " " + word;
      } else {
          lines.push(currentLine);
          currentLine = word;
      }
  }
  lines.push(currentLine);
  return lines;
}

function isHighContrast(contrast) {
  if (contrast) {
      return contrast === 'high';
  }
  else {
      return $('body').hasClass('contrast-high');
  }
}

// This plugin displays a message to the user whenever a chart has no data.
Chart.register({
  id: 'open-sdg-no-data-message',
  afterDraw: function(chart) {
    if (chart.data.datasets.length === 0) {

      var ctx = chart.ctx;
      var width = chart.width;
      var height = chart.height;

      chart.clear();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = "normal 40px 'Open Sans', Helvetica, Arial, sans-serif";
      ctx.fillStyle = (isHighContrast()) ? 'white' : 'black';
      var lines = getTextLinesOnCanvas(ctx, translations.indicator.data_not_available, width);
      var numLines = lines.length;
      var lineHeight = 50;
      var xLine = width / 2;
      var yLine = (height / 2) - ((lineHeight / 2) * numLines);
      for (var i = 0; i < numLines; i++) {
        ctx.fillText(lines[i], xLine, yLine);
        yLine += lineHeight;
      }
      ctx.restore();

      $('#selectionsChart').addClass('chart-has-no-data');
    }
    else {
      $('#selectionsChart').removeClass('chart-has-no-data');
    }
  }
});
// This plugin allows users to cycle through tooltips by keyboard.
Chart.register({
    id: 'open-sdg-accessible-charts',
    afterInit: function(chart) {
        var plugin = this;
        plugin.chart = chart;
        plugin.selectedIndex = -1;
        plugin.currentDataset = 0;
        plugin.setMeta();

        if (!$(chart.canvas).data('keyboardNavInitialized')) {
            $(chart.canvas).data('keyboardNavInitialized', true);
            plugin.initElements();
            chart.canvas.addEventListener('keydown', function(e) {
                if (e.key === 'ArrowRight') {
                    plugin.activateNext();
                    e.preventDefault();
                }
                else if (e.key === 'ArrowLeft') {
                    plugin.activatePrev();
                    e.preventDefault();
                }
            });
            chart.canvas.addEventListener('focus', function() {
                if (plugin.selectedIndex === -1) {
                    plugin.activateNext();
                } else {
                    plugin.activate();
                }
            });
        }
    },
    afterUpdate: function(chart) {
        this.setMeta();
    },
    setMeta: function() {
        this.meta = this.chart.getDatasetMeta(this.currentDataset);
    },
    initElements: function() {
        $('<span/>')
            .addClass('sr-only')
            .attr('id', 'chart-tooltip-status')
            .attr('role', 'status')
            .appendTo('#chart');
        if (window.innerWidth <= 768) {
            var mobileInstructions = translations.indicator.chart + '. ' + translations.indicator.data_tabular_alternative;
            $(this.chart.canvas).html('<span class="hide-during-image-download">' + mobileInstructions + '</span>');
        }
        else {
            var keyboardInstructions = translations.indicator.data_keyboard_navigation;
            $('<span/>')
                .css('display', 'none')
                .attr('id', 'chart-keyboard')
                .text(', ' + keyboardInstructions)
                .appendTo('#chart');
            var describedBy = $('#chart canvas').attr('aria-describedby');
            $(this.chart.canvas)
                .attr('role', 'application')
                .attr('aria-describedby', 'chart-keyboard ' + describedBy)
                .html('<span class="hide-during-image-download">Chart. ' + keyboardInstructions + '</span>')
        }
    },
    activate: function() {
        var activeElements = [];
        if (this.chart.config.type === 'line') {
            // For line charts, we combined all datasets into a single tooltip.
            var numDatasets = this.chart.data.datasets.length;
            for (var i = 0; i < numDatasets; i++) {
                activeElements.push({datasetIndex: i, index: this.selectedIndex});
            }
        }
        else {
            activeElements.push({datasetIndex: this.currentDataset, index: this.selectedIndex});
        }
        this.chart.tooltip.setActiveElements(activeElements);
        this.chart.render();
        this.announceTooltips()
    },
    isSelectedIndexEmpty: function() {
        var isEmpty = true;
        if (this.chart.config.type === 'line') {
            var numDatasets = this.chart.data.datasets.length;
            for (var i = 0; i < numDatasets; i++) {
                var dataset = this.chart.data.datasets[i],
                    value = dataset.data[this.selectedIndex];
                if (typeof value !== 'undefined') {
                    isEmpty = false;
                }
            }
        }
        else {
            var dataset = this.chart.data.datasets[this.currentDataset],
                value = dataset.data[this.selectedIndex];
            if (typeof value !== 'undefined') {
                isEmpty = false;
            }
        }
        return isEmpty;
    },
    activateNext: function() {
        // Abort early if no data.
        if (this.chart.data.datasets.length === 0) {
            return;
        }
        this.selectedIndex += 1;
        if (this.selectedIndex >= this.meta.data.length) {
            this.selectedIndex = 0;
            if (this.chart.config.type !== 'line') {
                this.nextDataset();
            }
        }
        while (this.isSelectedIndexEmpty()) {
            // Skip any empty years.
            this.activateNext();
            return;
        }
        this.activate();
    },
    activatePrev: function() {
        // Abort early if no data.
        if (this.chart.data.datasets.length === 0) {
            return;
        }
        this.selectedIndex -= 1;
        if (this.selectedIndex < 0) {
            if (this.chart.config.type !== 'line') {
                this.prevDataset();
            }
            this.selectedIndex = this.meta.data.length - 1;
        }
        while (this.isSelectedIndexEmpty()) {
            // Skip any empty years.
            this.activatePrev();
            return;
        }
        this.activate();
    },
    nextDataset: function() {
        var numDatasets = this.chart.data.datasets.length;
        this.currentDataset += 1;
        if (this.currentDataset >= numDatasets) {
            this.currentDataset = 0;
        }
        this.setMeta();
    },
    prevDataset: function() {
        var numDatasets = this.chart.data.datasets.length;
        this.currentDataset -= 1;
        if (this.currentDataset < 0) {
            this.currentDataset = numDatasets - 1;
        }
        this.setMeta();
    },
    announceTooltips: function() {
        var tooltips = this.chart.tooltip.getActiveElements();
        if (tooltips.length > 0) {
            var labels = {};
            for (var i = 0; i < tooltips.length; i++) {
                var datasetIndex = tooltips[i].datasetIndex,
                    pointIndex = tooltips[i].index,
                    year = this.chart.data.labels[pointIndex],
                    dataset = this.chart.data.datasets[datasetIndex],
                    label = dataset.label,
                    value = dataset.data[pointIndex];
                if (typeof labels[year] === 'undefined') {
                    labels[year] = [];
                }
                labels[year].push(label + ': ' + value);
            }
            var announcement = '';
            Object.keys(labels).forEach(function(year) {
                announcement += year + ' ';
                labels[year].forEach(function(label) {
                    announcement += label + ', ';
                });
            });
            var currentAnnouncement = $('#chart-tooltip-status').text();
            if (currentAnnouncement != announcement) {
                $('#chart-tooltip-status').text(announcement);
            }
        }
    }
});
function event(sender) {
  this._sender = sender;
  this._listeners = [];
}

event.prototype = {
  attach: function (listener) {
    this._listeners.push(listener);
  },
  notify: function (args) {
    var index;

    for (index = 0; index < this._listeners.length; index += 1) {
      this._listeners[index](this._sender, args);
    }
  }
};
var accessibilitySwitcher = function () {

    function getActiveContrast() {
        return $('body').hasClass('contrast-high') ? 'high' : 'default';
    }

    function setHighContrast() {
        $('body')
            .removeClass('contrast-default')
            .addClass('contrast-high');
        var title = translations.header.disable_high_contrast;
        var gaAttributes = opensdg.autotrack('switch_contrast', 'Accessibility', 'Change contrast setting', 'default');
        $('[data-contrast-switch-to]')
            .attr('data-contrast-switch-to', 'default')
            .attr('title', title)
            .attr('aria-label', title)
            .attr(gaAttributes);

        imageFix('high');
        createCookie('contrast', 'high', 365);
    }

    function setDefaultContrast() {
        $('body')
            .removeClass('contrast-high')
            .addClass('contrast-default');
        var title = translations.header.enable_high_contrast;
        var gaAttributes = opensdg.autotrack('switch_contrast', 'Accessibility', 'Change contrast setting', 'high');
        $('[data-contrast-switch-to]')
            .attr('data-contrast-switch-to', 'high')
            .attr('title', title)
            .attr('aria-label', title)
            .attr(gaAttributes);

        imageFix('default');
        createCookie('contrast', 'default', 365);

    }

    $('[data-contrast-switch-to]').click(function () {
        var newContrast = $(this).attr('data-contrast-switch-to');
        var oldContrast = getActiveContrast();
        if (newContrast === oldContrast) {
            return;
        }
        if (newContrast === 'high') {
            setHighContrast();
            broadcastContrastChange('high', this);
        }
        else {
            setDefaultContrast();
            broadcastContrastChange('default', this);
        }

    });

    function createCookie(name, value, days) {
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            var expires = "; expires=" + date.toGMTString();
        }
        else expires = "";
        document.cookie = name + "=" + value + expires + "; path=/";
    }

    function readCookie(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) == ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    function imageFix(contrast) {
        var doNotSwitchTheseSuffixes = ['.svg'];
        if (contrast == 'high') {
            _.each($('img:not([src*=high-contrast])'), function (image) {
                var src = $(image).attr('src').toLowerCase();
                var switchThisImage = true;
                for (var i = 0; i < doNotSwitchTheseSuffixes.length; i++) {
                    var suffix = doNotSwitchTheseSuffixes[i];
                    if (src.slice(0 - suffix.length) === suffix) {
                        switchThisImage = false;
                    }
                }
                if (switchThisImage) {
                    $(image).attr('src', $(image).attr('src').replace('img/', 'img/high-contrast/'));
                }
            });
        } else {
            // Remove high-contrast
            _.each($('img[src*=high-contrast]'), function (goalImage) {
                $(goalImage).attr('src', $(goalImage).attr('src').replace('high-contrast/', ''));
            })
        }
    };

    function broadcastContrastChange(contrast, elem) {
        var event = new CustomEvent('contrastChange', {
            bubbles: true,
            detail: contrast
        });
        elem.dispatchEvent(event);
    }

    window.onunload = function (e) {
        var contrast = getActiveContrast();
        createCookie('contrast', contrast, 365);
    }

    var cookie = readCookie('contrast');
    var contrast = cookie ? cookie : 'default';
    if (contrast === 'high') {
        setHighContrast();
    }
    else {
        setDefaultContrast();
    }

};

// Dynamic aria labels on navbar toggle.
$(document).ready(function() {
    $('#navbarSupportedContent').on('shown.bs.collapse', function() {
        $('.navbar-toggler').attr('aria-label', translations.header.hide_menu);
    });
    $('#navbarSupportedContent').on('hidden.bs.collapse', function() {
        $('.navbar-toggler').attr('aria-label', translations.header.show_menu);
    });
});
opensdg.chartColors = function(indicatorId) {
  var colorSet = "goal";
  var numberOfColors = 9;
  var customColorList = null;

  this.goalNumber = parseInt(indicatorId.slice(indicatorId.indexOf('_')+1,indicatorId.indexOf('-')));
  this.goalColors = [['891523', 'ef7b89', '2d070b', 'f4a7b0', 'b71c2f', 'ea4f62', '5b0e17', 'fce9eb'],
                ['896d1f', 'efd385', '2d240a', 'f4e2ae', 'b7922a', 'eac55d', '5b4915', 'f9f0d6'],
                ['2d5f21', '93c587', '0f1f0b', 'c9e2c3', '3c7f2c', '6fb25f', '1e3f16', 'a7d899'],
                ['760f1b', 'dc7581', '270509', 'f3d1d5', '9d1424', 'd04656', '4e0a12', 'e7a3ab'],
                ['b22817', 'ff7563', '330b06', 'ffd7d2', 'cc2e1a', 'ff614d', '7f1d10', 'ff9c90'],
                ['167187', '7cd7ed', '07252d', 'd3f1f9', '1e97b4', '51cae7', '0f4b5a', 'a8e4f3'],
                ['977506', 'fddb6c', '322702', 'fef3ce', 'c99c08', 'fccf3b', '644e04', 'fde79d'],
                ['610f27', 'c7758d', '610F28', 'ecd1d9', '811434', 'b44667', '400a1a', 'd9a3b3'],
                ['973f16', 'fda57c', '321507', 'fee1d3', 'ca541d', 'fd8750', '652a0e', 'fec3a7'],
                ['840b3d', 'ea71a3', '2c0314', 'f8cfe0', 'b00f52', 'd5358b', '580729', 'f1a0c2'],
                ['653e0e', 'fed7a7', 'b16d19', 'fdba65', 'b14a1e', 'fd976b', '000000', 'fed2bf'],
                ['785b1b', 'dec181', '281e09', 'f4ead5', 'a07a24', 'd3ad56', '503d12', 'e9d6ab'],
                ['254b28', '8bb18e', '0c190d', 'd8e5d9', '326436', '659769', '19321b', 'b2cbb4'],
                ['065a82', '6cc0e8', '021e2b', 'ceeaf7', '0878ad', '3aabe0', '043c56', '9dd5ef'],
                ['337319', '99d97f', '112608', 'ddf2d4', '449922', '77cc55', '224c11', 'bbe5aa'],
                ['00293e', '99c2d7', '00486d', '4c95ba', '126b80', 'cce0eb', '5a9fb0', 'a1c8d2'],
                ['0a1c2a', '8ca3b4', '16377c', 'd1dae1', '11324a', '466c87', '5b73a3', '0f2656']];
  this.colorSets = {'classic':['7e984f', '8d73ca', 'aaa533', 'c65b8a', '4aac8d', 'c95f44'],
                  'sdg':['e5243b', 'dda63a', '4c9f38', 'c5192d', 'ff3a21', '26bde2', 'fcc30b', 'a21942', 'fd6925', 'dd1367','fd9d24','bf8b2e','3f7e44','0a97d9','56c02b','00689d','19486a'],
                  'goal': this.goalColors[this.goalNumber-1],
                  'custom': customColorList,
                  'accessible': ['cd7a00', '339966', '9966cc', '8d4d57', 'A33600', '054ce6']};
  if(Object.keys(this.colorSets).indexOf(colorSet) == -1 || (colorSet=='custom' && customColorList == null)){
    return this.colorSets['accessible'];
  }
  this.numberOfColors = (numberOfColors>this.colorSets[colorSet].length || numberOfColors == null || numberOfColors == 0) ? this.colorSets[colorSet].length : numberOfColors;
  this.colors = this.colorSets[colorSet].slice(0,this.numberOfColors);

  return this.colors;

};
var indicatorModel = function (options) {

  var helpers = 
(function() {

  /**
 * Constants to be used in indicatorModel.js and helper functions.
 */
var UNIT_COLUMN = 'Units';
var SERIES_COLUMN = 'Series';
var GEOCODE_COLUMN = 'GeoCode';
var YEAR_COLUMN = 'Year';
var VALUE_COLUMN = 'Value';
// Note this headline color is overridden in indicatorView.js.
var HEADLINE_COLOR = '#777777';
var GRAPH_TITLE_FROM_SERIES = true;

  /**
 * Model helper functions with general utility.
 */

/**
 * @param {string} prop Property to get unique values from
 * @param {Array} rows
 */
function getUniqueValuesByProperty(prop, rows) {
  var uniques = new Set();
  rows.forEach(function(row) {
    if (row[prop] != null) {
      uniques.add(row[prop])
    }
  });
  return Array.from(uniques);
}

// Use as a callback to Array.prototype.filter to get unique elements
function isElementUniqueInArray(element, index, arr) {
  return arr.indexOf(element) === index;
}

/**
 * @param {Array} columns
 * @return {boolean}
 */
function dataHasGeoCodes(columns) {
  return columns.includes(GEOCODE_COLUMN);
}

/**
 * @param {Array} rows
 * @return {Array} Columns from first row
 */
function getColumnsFromData(rows) {
  return Object.keys(rows.reduce(function(result, obj) {
    return Object.assign(result, obj);
  }, {}));
}

/**
 * @param {Array} columns
 * @return {Array} Columns without non-fields
 */
function getFieldColumnsFromData(columns) {
  var omitColumns = nonFieldColumns();
  return columns.filter(function(col) {
    return !omitColumns.includes(col);
  });
}

/**
 * @return {Array} Data columns that have a special purpose
 *
 * All other data columns can be considered "field columns".
 */
function nonFieldColumns() {
  var columns = [
    YEAR_COLUMN,
    VALUE_COLUMN,
    UNIT_COLUMN,
    GEOCODE_COLUMN,
    'Observation status',
    'Unit multiplier',
    'Unit measure',
  ];
  var timeSeriesAttributes = [{"field":"COMMENT_TS","label":"indicator.footnote"},{"field":"DATA_LAST_UPDATE","label":"metadata_fields.national_data_update_url"}];
  timeSeriesAttributes.forEach(function(tsAttribute) {
    columns.push(tsAttribute.field);
  });
  columns.push(SERIES_COLUMN);
  return columns;
}

/**
 * @param {Array} items Objects optionally containing 'unit' and/or 'series'
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {object|false} The first match given the selected unit/series, or false
 */
function getMatchByUnitSeries(items, selectedUnit, selectedSeries) {
  var matches = getMatchesByUnitSeries(items, selectedUnit, selectedSeries);
  return (matches.length > 0) ? matches[0] : false;
}

/**
 * @param {Array} items Objects optionally containing 'unit' and/or 'series'
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {Array} All matches given the selected unit/series, if any.
 */
function getMatchesByUnitSeries(items, selectedUnit, selectedSeries) {
  if (!items || items.length === 0) {
    return [];
  }
  if (!selectedUnit && !selectedSeries) {
    return items;
  }
  // First pass to find any exact matches.
  var matches = items.filter(function(item) {
    var seriesMatch = item.series === selectedSeries,
        unitMatch = item.unit === selectedUnit;
    if (selectedUnit && selectedSeries) {
      return seriesMatch && unitMatch;
    }
    else if (selectedUnit) {
      return unitMatch;
    }
    else if (selectedSeries) {
      return seriesMatch;
    }
  });
  // Second pass to find any partial matches with unspecified unit/series.
  if (matches.length === 0) {
    matches = items.filter(function(item) {
      var seriesMatch = item.series === selectedSeries && item.series && !item.unit,
          unitMatch = item.unit === selectedUnit && item.unit && !item.series;
      if (selectedUnit && selectedSeries) {
        return seriesMatch || unitMatch;
      }
      else if (selectedUnit) {
        return unitMatch;
      }
      else if (selectedSeries) {
        return seriesMatch;
      }
    });
  }
  // Third pass to catch cases where nothing at all was specified.
  if (matches.length === 0) {
    matches = items.filter(function(item) {
      var nothingSpecified = !item.unit && !item.series;
      return nothingSpecified;
    });
  }
  return matches;
}

  /**
 * Model helper functions related to units.
 */

/**
 * @param {Array} rows
 * @return {boolean}
 */
function dataHasUnits(columns) {
  return columns.includes(UNIT_COLUMN);
}

/**
 * @param {Array} fieldsUsedByUnit Field names
 * @return {boolean}
 */
function dataHasUnitSpecificFields(fieldsUsedByUnit) {
  return !_.every(_.map(fieldsUsedByUnit, 'fields'), function(fields) {
    return _.isEqual(_.sortBy(_.map(fieldsUsedByUnit, 'fields')[0]), _.sortBy(fields));
  });
}

/**
 * @param {Array} units
 * @param {Array} rows
 * @return {Array} Field names
 */
function fieldsUsedByUnit(units, rows, columns) {
  var fields = getFieldColumnsFromData(columns);
  return units.map(function(unit) {
    return {
      unit: unit,
      fields: fields.filter(function(field) {
        return fieldIsUsedInDataWithUnit(field, unit, rows);
      }, this),
    }
  }, this);
}

/**
 * @param {string} field
 * @param {string} unit
 * @param {Array} rows
 */
function fieldIsUsedInDataWithUnit(field, unit, rows) {
  return rows.some(function(row) {
    return row[field] && row[UNIT_COLUMN] === unit;
  }, this);
}

/**
 * @param {Array} rows
 * @param {string} unit
 * @return {Array} Rows
 */
function getDataByUnit(rows, unit) {
  return rows.filter(function(row) {
    return row[UNIT_COLUMN] === unit;
  }, this);
}

/**
 * @param {Array} rows
 * @return {string}
 */
function getFirstUnitInData(rows) {
  return rows.find(function(row) {
    return row[UNIT_COLUMN];
  }, this)[UNIT_COLUMN];
}

/**
 * @param {Array} startValues Objects containing 'field' and 'value'
 * @return {string|boolean} Unit, or false if none were found
 */
function getUnitFromStartValues(startValues) {
  var match = startValues.find(function(startValue) {
    return startValue.field === UNIT_COLUMN;
  }, this);
  return (match) ? match.value : false;
}

  /**
 * Model helper functions related to serieses.
 */

/**
 * @param {Array} columns
 * @return {boolean}
 */
function dataHasSerieses(columns) {
  return columns.includes(SERIES_COLUMN);
}

/**
 * @param {Array} fieldsUsedBySeries Field names
 * @return {boolean}
 */
function dataHasSeriesSpecificFields(fieldsUsedBySeries) {
  return !_.every(_.map(fieldsUsedBySeries, 'fields'), function(fields) {
    return _.isEqual(_.sortBy(_.map(fieldsUsedBySeries, 'fields')[0]), _.sortBy(fields));
  });
}

/**
 * @param {Array} serieses
 * @param {Array} rows
 * @return {Array} Field names
 */
function fieldsUsedBySeries(serieses, rows, columns) {
  var fields = getFieldColumnsFromData(columns);
  return serieses.map(function(series) {
    return {
      series: series,
      fields: fields.filter(function(field) {
        return fieldIsUsedInDataWithSeries(field, series, rows);
      }, this),
    }
  }, this);
}

/**
 * @param {string} field
 * @param {string} series
 * @param {Array} rows
 */
function fieldIsUsedInDataWithSeries(field, series, rows) {
  return rows.some(function(row) {
    return row[field] && row[SERIES_COLUMN] === series;
  }, this);
}

/**
 * @param {Array} rows
 * @param {string} series
 * @return {Array} Rows
 */
function getDataBySeries(rows, series) {
  return rows.filter(function(row) {
    return row[SERIES_COLUMN] === series;
  }, this);
}

/**
 * @param {Array} rows
 * @return {string}
 */
function getFirstSeriesInData(rows) {
  return rows.find(function(row) {
    return row[SERIES_COLUMN];
  }, this)[SERIES_COLUMN];
}

/**
 * @param {Array} startValues Objects containing 'field' and 'value'
 * @return {string|boolean} Series, or false if none were found
 */
function getSeriesFromStartValues(startValues) {
  var match = startValues.find(function(startValue) {
    return startValue.field === SERIES_COLUMN;
  }, this);
  return (match) ? match.value : false;
}

  /**
 * Model helper functions related to fields and data.
 */

/**
 * @param {Array} rows
 * @param {Array} edges
 * @return {Array} Field item states
 */

function getInitialFieldItemStates(rows, edges, columns, dataSchema) {
  var fields = getFieldColumnsFromData(columns);
  sortFieldNames(fields, dataSchema);
  var initial = fields.map(function(field) {
    var values = getUniqueValuesByProperty(field, rows);
    sortFieldValueNames(field, values, dataSchema);
    return {
      field: field,
      hasData: true,
      values: values.map(function(value) {
        return {
          value: value,
          state: 'default',
          checked: false,
          hasData: true
        };
      }, this),
    };
  }, this);

  return sortFieldItemStates(initial, edges, dataSchema);
}

/**
 * @param {Array} fieldItemStates
 * @param {Array} edges
 * return {Array} Sorted field item states
 */
function sortFieldItemStates(fieldItemStates, edges, dataSchema) {
  if (edges.length > 0) {
    var froms = getUniqueValuesByProperty('From', edges).sort();
    var tos = getUniqueValuesByProperty('To', edges).sort();
    var orderedEdges = froms.concat(tos);
    var fieldsNotInEdges = fieldItemStates
      .map(function(fis) { return fis.field; })
      .filter(function(field) { return !orderedEdges.includes(field); });
    var customOrder = orderedEdges.concat(fieldsNotInEdges);
    sortFieldNames(customOrder, dataSchema);

    return _.sortBy(fieldItemStates, function(item) {
      return customOrder.indexOf(item.field);
    });
  }
  return fieldItemStates;
}

/**
 * @param {Array} fieldItemStates
 * @param {Array} edges
 * @param {Array} selectedFields Field items
 * @param {Object} validParentsByChild Arrays of parents keyed to children
 * @return {Array} Field item states
 */
function getUpdatedFieldItemStates(fieldItemStates, edges, selectedFields, validParentsByChild) {
  var selectedFieldNames = getFieldNames(selectedFields);
  getParentFieldNames(edges).forEach(function(parentFieldName) {
    if (selectedFieldNames.includes(parentFieldName)) {
      var childFieldNames = getChildFieldNamesByParent(edges, parentFieldName);
      var selectedParent = selectedFields.find(function(selectedField) {
        return selectedField.field === parentFieldName;
      }, this);
      fieldItemStates.forEach(function(fieldItem) {
        if (childFieldNames.includes(fieldItem.field)) {
          var fieldHasData = false;
          fieldItem.values.forEach(function(childValue) {
            var valueHasData = false;
            selectedParent.values.forEach(function(parentValue) {
              if (validParentsByChild[fieldItem.field][childValue.value].includes(parentValue)) {
                valueHasData = true;
                fieldHasData = true;
              }
            }, this);
            childValue.hasData = valueHasData;
          }, this);
          fieldItem.hasData = fieldHasData;
        }
      }, this);
    }
  }, this);
  return fieldItemStates;
}

/**
 * @param {Array} fieldItems
 * @return {Array} Field names
 */
function getFieldNames(fieldItems) {
  return fieldItems.map(function(item) { return item.field; });
}

/**
 * @param {Array} edges
 * @return {Array} Names of parent fields
 */
function getParentFieldNames(edges) {
  return edges.map(function(edge) { return edge.From; });
}

/**
 * @param {Array} edges
 * @param {string} parent
 * @return {Array} Children of parent
 */
function getChildFieldNamesByParent(edges, parent) {
  var children = edges.filter(function(edge) {
    return edge.From === parent;
  });
  return getChildFieldNames(children);
}

/**
 * @param {Array} edges
 * @return {Array} Names of child fields
 */
function getChildFieldNames(edges) {
  return edges.map(function(edge) { return edge.To; });
}

/**
 * @param {Array} fieldItemStates
 * @param {Array} fieldsByUnit Objects containing 'unit' and 'fields'
 * @param {string} selectedUnit
 * @param {boolean} dataHasUnitSpecificFields
 * @param {Array} fieldsBySeries Objects containing 'series' and 'fields'
 * @param {string} selectedSeries
 * @param {boolean} dataHasSeriesSpecificFields
 * @param {Array} selectedFields Field items
 * @param {Array} edges
 * @param {string} compositeBreakdownLabel Alternate label for COMPOSITE_BREAKDOWN fields
 * @return {Array} Field item states (with additional "label" properties)
 */
function fieldItemStatesForView(fieldItemStates, fieldsByUnit, selectedUnit, dataHasUnitSpecificFields, fieldsBySeries, selectedSeries, dataHasSeriesSpecificFields, selectedFields, edges, compositeBreakdownLabel) {
  var states = fieldItemStates.map(function(item) { return item; });
  if (dataHasUnitSpecificFields && dataHasSeriesSpecificFields) {
    states = fieldItemStatesForSeries(fieldItemStates, fieldsBySeries, selectedSeries);
    states = fieldItemStatesForUnit(states, fieldsByUnit, selectedUnit);
  }
  else if (dataHasSeriesSpecificFields) {
    states = fieldItemStatesForSeries(fieldItemStates, fieldsBySeries, selectedSeries);
  }
  else if (dataHasUnitSpecificFields) {
    states = fieldItemStatesForUnit(fieldItemStates, fieldsByUnit, selectedUnit);
  }

  if (selectedFields && selectedFields.length > 0) {
    states.forEach(function(fieldItem) {
      var selectedField = selectedFields.find(function(selectedItem) {
        return selectedItem.field === fieldItem.field;
      });
      if (selectedField) {
        selectedField.values.forEach(function(selectedValue) {
          var fieldItemValue = fieldItem.values.find(function(valueItem) {
            return valueItem.value === selectedValue;
          });
          if (fieldItemValue) {
            fieldItemValue.checked = true;
          }
        })
      }
    });
  }
  sortFieldsForView(states, edges);
  return states.map(function(item) {
    item.label = item.field;
    if (item.field === 'COMPOSITE_BREAKDOWN' && compositeBreakdownLabel !== '') {
      item.label = compositeBreakdownLabel;
    }
    return item;
  });
}

/**
 * @param {Array} fieldItemStates
 * @param {Array} edges
 */
function sortFieldsForView(fieldItemStates, edges) {
  if (edges.length > 0 && fieldItemStates.length > 0) {

    var parents = edges.map(function(edge) { return edge.From; });
    var children = edges.map(function(edge) { return edge.To; });
    var topLevelParents = [];
    parents.forEach(function(parent) {
      if (!(children.includes(parent)) && !(topLevelParents.includes(parent))) {
        topLevelParents.push(parent);
      }
    });

    var topLevelParentsByChild = {};
    children.forEach(function(child) {
      var currentParent = edges.find(function(edge) { return edge.To === child; }),
          currentChild = child;
      while (currentParent) {
        currentParent = edges.find(function(edge) { return edge.To === currentChild; });
        if (currentParent) {
          currentChild = currentParent.From;
          topLevelParentsByChild[child] = currentParent.From;
        }
      }
    });
    fieldItemStates.forEach(function(fieldItem) {
      if (topLevelParents.includes(fieldItem.field) || typeof topLevelParentsByChild[fieldItem.field] === 'undefined') {
        fieldItem.topLevelParent = '';
      }
      else {
        fieldItem.topLevelParent = topLevelParentsByChild[fieldItem.field];
      }
    });

    // As an intermediary step, create a hierarchical structure grouped
    // by the top-level parent.
    var tempHierarchy = [];
    var tempHierarchyHash = {};
    fieldItemStates.forEach(function(fieldItem) {
      if (fieldItem.topLevelParent === '') {
        fieldItem.children = [];
        tempHierarchyHash[fieldItem.field] = fieldItem;
        tempHierarchy.push(fieldItem);
      }
    });
    fieldItemStates.forEach(function(fieldItem) {
      if (fieldItem.topLevelParent !== '') {
        tempHierarchyHash[fieldItem.topLevelParent].children.push(fieldItem);
      }
    });

    // Now we clear out the field items and add them back as a flat list.
    fieldItemStates.length = 0;
    tempHierarchy.forEach(function(fieldItem) {
      fieldItemStates.push(fieldItem);
      fieldItem.children.forEach(function(child) {
        fieldItemStates.push(child);
      });
    });
  }
}

/**
 * @param {Array} fieldItemStates
 * @param {Array} fieldsByUnit Objects containing 'unit' and 'fields'
 * @param {string} selectedUnit
 * @return {Array} Field item states
 */
function fieldItemStatesForUnit(fieldItemStates, fieldsByUnit, selectedUnit) {
  var fieldsBySelectedUnit = fieldsByUnit.filter(function(fieldByUnit) {
    return fieldByUnit.unit === selectedUnit;
  })[0];
  return fieldItemStates.filter(function(fis) {
    return fieldsBySelectedUnit.fields.includes(fis.field);
  });
}

/**
 * @param {Array} fieldItemStates
 * @param {Array} fieldsBySeries Objects containing 'series' and 'fields'
 * @param {string} selectedSeries
 * @return {Array} Field item states
 */
function fieldItemStatesForSeries(fieldItemStates, fieldsBySeries, selectedSeries) {
  var fieldsBySelectedSeries = fieldsBySeries.filter(function(fieldBySeries) {
    return fieldBySeries.series === selectedSeries;
  })[0];
  return fieldItemStates.filter(function(fis) {
    return fieldsBySelectedSeries.fields.includes(fis.field);
  });
}

/**
 * @param {Array} fieldItems
 * @return {Array} Objects representing disaggregation combinations
 */
function getCombinationData(fieldItems) {

  // First get a list of all the single field/value pairs.
  var fieldValuePairs = [];
  fieldItems.forEach(function(fieldItem) {
    fieldItem.values.forEach(function(value) {
      var pair = {};
      pair[fieldItem.field] = value;
      fieldValuePairs.push(pair);
    });
  });

  // Generate all possible subsets of these key/value pairs.
  var powerset = [];
  // Start off with an empty item.
  powerset.push([]);
  for (var i = 0; i < fieldValuePairs.length; i++) {
    for (var j = 0, len = powerset.length; j < len; j++) {
      var candidate = powerset[j].concat(fieldValuePairs[i]);
      if (!hasDuplicateField(candidate)) {
        powerset.push(candidate);
      }
    }
  }

  function hasDuplicateField(pairs) {
    var fields = [], i;
    for (i = 0; i < pairs.length; i++) {
      var field = Object.keys(pairs[i])[0]
      if (fields.includes(field)) {
        return true;
      }
      else {
        fields.push(field);
      }
    }
    return false;
  }

  // Remove the empty item.
  powerset.shift();

  return powerset.map(function(combinations) {
    // We want to merge these into a single object.
    var combinedSubset = {};
    combinations.forEach(function(keyValue) {
      Object.assign(combinedSubset, keyValue);
    });
    return combinedSubset;
  });
}

/**
 * @param {Array} startValues Objects containing 'field' and 'value'
 * @param {Array} selectableFieldNames
 * @return {Array} Field items
 */
function selectFieldsFromStartValues(startValues, selectableFieldNames) {
  if (!startValues) {
    return [];
  }
  var allowedStartValues = startValues.filter(function(startValue) {
    var normalField = !nonFieldColumns().includes(startValue.field);
    var allowedField = selectableFieldNames.includes(startValue.field)
    return normalField && allowedField;
  });
  var valuesByField = {};
  allowedStartValues.forEach(function(startValue) {
    if (!(startValue.field in valuesByField)) {
      valuesByField[startValue.field] = [];
    }
    valuesByField[startValue.field].push(startValue.value);
  });
  return Object.keys(valuesByField).map(function(field) {
    return {
      field: field,
      values: _.uniq(valuesByField[field]),
    };
  });
}

/**
 * @param {Array} rows
 * @param {Array} selectableFieldNames Field names
 * @param {string} selectedUnit
 * @return {Array} Field items
 */
function selectMinimumStartingFields(rows, selectableFieldNames, selectedUnit) {
  var filteredData = rows;
  if (selectedUnit) {
    filteredData = filteredData.filter(function(row) {
      return row[UNIT_COLUMN] === selectedUnit;
    });
  }
  filteredData = filteredData.filter(function(row) {
    return selectableFieldNames.some(function(fieldName) {
      return row[fieldName];
    });
  });
  // Sort the data by each field. We go in reverse order so that the
  // first field will be highest "priority" in the sort.
  selectableFieldNames.reverse().forEach(function(fieldName) {
    filteredData = _.sortBy(filteredData, fieldName);
  });
  // But actually we want the top-priority sort to be the "size" of the
  // rows. In other words we want the row with the fewest number of fields.
  filteredData = _.sortBy(filteredData, function(row) { return Object.keys(row).length; });

  if (filteredData.length === 0) {
    return [];
  }

  // Convert to an array of objects with 'field' and 'values' keys, omitting
  // any non-field columns.
  return Object.keys(filteredData[0]).filter(function(key) {
    return !nonFieldColumns().includes(key);
  }).map(function(field) {
    return {
      field: field,
      values: [filteredData[0][field]]
    };
  });
}

/**
 * @param {Array} edges
 * @param {Array} fieldItemStates
 * @param {Array} rows
 * @return {Object} Arrays of parents keyed to children
 *
 * @TODO: This function can be a bottleneck in large datasets with a lot of
 * disaggregation values. Can this be further optimized?
 */
function validParentsByChild(edges, fieldItemStates, rows) {
  var parentFields = getParentFieldNames(edges);
  var childFields = getChildFieldNames(edges);
  var validParentsByChild = {};
  childFields.forEach(function(childField, fieldIndex) {
    var fieldItemState = fieldItemStates.find(function(fis) {
      return fis.field === childField;
    });
    var childValues = fieldItemState.values.map(function(value) {
      return value.value;
    });
    var parentField = parentFields[fieldIndex];
    var childRows = rows.filter(function(row) {
      var childNotEmpty = row[childField];
      var parentNotEmpty = row[parentField];
      return childNotEmpty && parentNotEmpty;
    })
    validParentsByChild[childField] = {};
    childValues.forEach(function(childValue) {
      var rowsWithParentValues = childRows.filter(function(row) {
        return row[childField] == childValue;
      });
      validParentsByChild[childField][childValue] = getUniqueValuesByProperty(parentField, rowsWithParentValues);
    });
  });
  return validParentsByChild;
}

/**
 * @param {Array} selectableFields Field names
 * @param {Array} edges
 * @param {Array} selectedFields Field items
 * @return {Array} Field names
 */
function getAllowedFieldsWithChildren(selectableFields, edges, selectedFields) {
  var allowedFields = getInitialAllowedFields(selectableFields, edges);
  var selectedFieldNames = getFieldNames(selectedFields);
  getParentFieldNames(edges).forEach(function(parentFieldName) {
    if (selectedFieldNames.includes(parentFieldName)) {
      var childFieldNames = getChildFieldNamesByParent(edges, parentFieldName);
      allowedFields = allowedFields.concat(childFieldNames);
    }
  }, this);
  return allowedFields.filter(isElementUniqueInArray);
}

/**
 *
 * @param {Array} fieldNames
 * @param {Array} edges
 * @return {Array} Field names
 */
function getInitialAllowedFields(fieldNames, edges) {
  var children = getChildFieldNames(edges);
  return fieldNames.filter(function(field) { return !children.includes(field); });
}

/**
 * @param {Array} selectedFields Field names
 * @param {Array} edges
 * @return {Array} Selected fields without orphans
 */
function removeOrphanSelections(selectedFields, edges) {
  var selectedFieldNames = selectedFields.map(function(selectedField) {
    return selectedField.field;
  });
  edges.forEach(function(edge) {
    if (!selectedFieldNames.includes(edge.From)) {
      selectedFields = selectedFields.filter(function(selectedField) {
        return selectedField.field !== edge.From;
      });
    }
  });
  return selectedFields;
}

/**
 * @param {Array} rows
 * @param {Array} selectedFields Field items
 * @return {Array} Rows
 */
function getDataBySelectedFields(rows, selectedFields) {
  return rows.filter(function(row) {
    return selectedFields.some(function(field) {
      return field.values.includes(row[field.field]);
    });
  });
}

/**
 * @param {Array} fieldNames
 * @param {Object} dataSchema
 */
function sortFieldNames(fieldNames, dataSchema) {
  if (dataSchema && dataSchema.fields) {
    var schemaFieldNames = dataSchema.fields.map(function(field) { return field.name; });
    // If field names have been translated, we may need to use titles.
    if (schemaFieldNames.length > 0 && !(fieldNames.includes(schemaFieldNames[0]))) {
      schemaFieldNames = dataSchema.fields.map(function(field) { return field.title; });
    }
    fieldNames.sort(function(a, b) {
      return schemaFieldNames.indexOf(a) - schemaFieldNames.indexOf(b);
    });
  }
  else {
    fieldNames.sort();
  }
}

/**
 * @param {string} fieldName
 * @param {Array} fieldValues
 * @param {Object} dataSchema
 */
function sortFieldValueNames(fieldName, fieldValues, dataSchema) {
  if (dataSchema && dataSchema.fields) {
    var fieldSchema = dataSchema.fields.find(function(x) { return x.name == fieldName; });
    // If field names have been translated, we may need to use titles.
    if (!fieldSchema) {
      fieldSchema = dataSchema.fields.find(function(x) { return x.title == fieldName; });
    }
    if (fieldSchema && fieldSchema.constraints && fieldSchema.constraints.enum) {
      fieldValues.sort(function(a, b) {
        return fieldSchema.constraints.enum.indexOf(a) - fieldSchema.constraints.enum.indexOf(b);
      });
    }
    else {
      fieldValues.sort();
    }
  }
  else {
    fieldValues.sort();
  }
}

  /**
 * Model helper functions related to charts and datasets.
 */

/**
 * @param {string} currentTitle
 * @param {Array} allTitles Objects containing 'unit' and 'title'
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {String} Updated title
 */
function getChartTitle(currentTitle, allTitles, selectedUnit, selectedSeries) {
  var match = getMatchByUnitSeries(allTitles, selectedUnit, selectedSeries);
  return (match) ? match.title : currentTitle;
}

/**
 * @param {string} currentType
 * @param {Array} allTypes Objects containing 'unit', 'series', and 'type'
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {String} Updated type
 */
function getChartType(currentType, allTypes, selectedUnit, selectedSeries) {
  if (!currentType) {
    currentType = 'line';
  }
  var match = getMatchByUnitSeries(allTypes, selectedUnit, selectedSeries);
  return (match) ? match.type : currentType;
}

/**
 * @param {Array} graphLimits Objects containing 'unit' and 'title'
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {Object|false} Graph limit object, if any
 */
function getGraphLimits(graphLimits, selectedUnit, selectedSeries) {
  return getMatchByUnitSeries(graphLimits, selectedUnit, selectedSeries);
}

/**
 * @param {Array} graphAnnotations Objects containing 'unit' or 'series' or more
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {Array} Graph annotations objects, if any
 */
function getGraphAnnotations(graphAnnotations, selectedUnit, selectedSeries, graphTargetLines, graphSeriesBreaks, graphErrorBars) {
  var annotations = getMatchesByUnitSeries(graphAnnotations, selectedUnit, selectedSeries);
  if (graphTargetLines) {
    annotations = annotations.concat(getGraphTargetLines(graphTargetLines, selectedUnit, selectedSeries));
  }
  if (graphSeriesBreaks) {
    annotations = annotations.concat(getGraphSeriesBreaks(graphSeriesBreaks, selectedUnit, selectedSeries));
  }
  if (graphErrorBars) {
    annotations = annotations.concat(getGraphErrorBars(graphErrorBars, selectedUnit, selectedSeries));
  }
  return annotations;
}

/**
 * @param {Array} graphTargetLines Objects containing 'unit' or 'series' or more
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {Array} Graph annotations objects, if any
 */
function getGraphTargetLines(graphTargetLines, selectedUnit, selectedSeries) {
  return getMatchesByUnitSeries(graphTargetLines, selectedUnit, selectedSeries).map(function(targetLine) {
    targetLine.preset = 'target_line';
    targetLine.label = { content: targetLine.label_content };
    return targetLine;
  });
}

/**
 * @param {Array} graphErrorBars Objects containing 'unit' or 'series' or more
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {Array} Graph annotations objects, if any
 */
function getGraphErrorBars(graphErrorBars, selectedUnit, selectedSeries) {
  return getMatchesByUnitSeries(graphErrorBars, selectedUnit, selectedSeries).map(function(errorBar) {
    errorBar.preset = 'error_bar';
    errorBar.label = { content: errorBar.label_content };
    return errorBar;
  });
}

/**
 * @param {Array} graphSeriesBreaks Objects containing 'unit' or 'series' or more
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {Array} Graph annotations objects, if any
 */
function getGraphSeriesBreaks(graphSeriesBreaks, selectedUnit, selectedSeries) {
  return getMatchesByUnitSeries(graphSeriesBreaks, selectedUnit, selectedSeries).map(function(seriesBreak) {
    seriesBreak.preset = 'series_break';
    seriesBreak.label = { content: seriesBreak.label_content };
    return seriesBreak;
  });
}

/**
 * @param {Array} headline Rows
 * @param {Array} rows
 * @param {Array} combinations Objects representing disaggregation combinations
 * @param {Array} years
 * @param {string} defaultLabel
 * @param {Array} colors
 * @param {Array} selectableFields Field names
 * @param {Array} colorAssignments Color/striping assignments for disaggregation combinations
 * @return {Array} Datasets suitable for Chart.js
 */
function getDatasets(headline, data, combinations, years, defaultLabel, colors, selectableFields, colorAssignments, showLine, spanGaps) {
  console.log("Combinations: ", combinations);
  var datasets = [], index = 0, dataset, colorIndex, color, background, border, striped, excess, combinationKey, colorAssignment, showLine, spanGaps;
  var numColors = colors.length,
      maxColorAssignments = numColors * 2;

  prepareColorAssignments(colorAssignments, maxColorAssignments);
  setAllColorAssignmentsReadyForEviction(colorAssignments);

  combinations.forEach(function(combination) {
    var filteredData = getDataMatchingCombination(data, combination, selectableFields);
    if (filteredData.length > 0) {
      excess = (index >= maxColorAssignments);
      if (excess) {
        // This doesn't really matter: excess datasets won't be displayed.
        color = getHeadlineColor();
        striped = false;
      }
      else {
        combinationKey = JSON.stringify(combination);
        colorAssignment = getColorAssignmentByCombination(colorAssignments, combinationKey);
        if (colorAssignment !== undefined) {
          colorIndex = colorAssignment.colorIndex;
          striped = colorAssignment.striped;
          colorAssignment.readyForEviction = false;
        }
        else {
          if (colorAssignmentsAreFull(colorAssignments)) {
            evictColorAssignment(colorAssignments);
          }
          var openColorInfo = getOpenColorInfo(colorAssignments, colors);
          colorIndex = openColorInfo.colorIndex;
          striped = openColorInfo.striped;
          colorAssignment = getAvailableColorAssignment(colorAssignments);
          assignColor(colorAssignment, combinationKey, colorIndex, striped);
        }
      }

      color = getColor(colorIndex, colors);
      background = getBackground(color, striped);
      border = getBorderDash(striped);

      dataset = makeDataset(years, filteredData, combination, defaultLabel, color, background, border, excess, showLine, spanGaps);
      datasets.push(dataset);
      index++;
    }
  }, this);

  if (headline.length > 0) {
    dataset = makeHeadlineDataset(years, headline, defaultLabel, showLine, spanGaps);
    datasets.unshift(dataset);
  }
  console.log("DATASETS: ", datasets);
  return datasets;
}

/**
 * @param {Array} colorAssignments
 * @param {int} maxColorAssignments
 */
function prepareColorAssignments(colorAssignments, maxColorAssignments) {
  while (colorAssignments.length < maxColorAssignments) {
    colorAssignments.push({
      combination: null,
      colorIndex: null,
      striped: false,
      readyForEviction: false,
    });
  }
}

/**
 * @param {Array} colorAssignments
 */
function setAllColorAssignmentsReadyForEviction(colorAssignments) {
  for (var i = 0; i < colorAssignments.length; i++) {
    colorAssignments[i].readyForEviction = true;
  }
}

/**
 * @param {Array} rows
 * @param {Object} combination Key/value representation of a field combo
 * @param {Array} selectableFields Field names
 * @return {Array} Matching rows
 */
function getDataMatchingCombination(data, combination, selectableFields) {
  return data.filter(function(row) {
    return selectableFields.every(function(field) {
      return row[field] === combination[field];
    });
  });
}

/**
 * @param {Array} colorAssignments
 * @param {string} combination
 * @return {Object|undefined} Color assignment object if found.
 */
function getColorAssignmentByCombination(colorAssignments, combination) {
  return colorAssignments.find(function(assignment) {
    return assignment.combination === combination;
  });
}

/**
 * @param {Array} colorAssignments
 * @return {boolean}
 */
function colorAssignmentsAreFull(colorAssignments) {
  for (var i = 0; i < colorAssignments.length; i++) {
    if (colorAssignments[i].combination === null) {
      return false;
    }
  }
  return true;
}

/**
 * @param {Array} colorAssignments
 */
function evictColorAssignment(colorAssignments) {
  for (var i = 0; i < colorAssignments.length; i++) {
    if (colorAssignments[i].readyForEviction) {
      colorAssignments[i].combination = null;
      colorAssignments[i].colorIndex = null;
      colorAssignments[i].striped = false;
      colorAssignments[i].readyForEviction = false;
      return;
    }
  }
  throw 'Could not evict color assignment';
}

/**
 * @param {Array} colorAssignments
 * @param {Array} colors
 * @return {Object} Object with 'colorIndex' and 'striped' properties.
 */
function getOpenColorInfo(colorAssignments, colors) {
  // First look for normal colors, then striped.
  var stripedStates = [false, true];
  for (var i = 0; i < stripedStates.length; i++) {
    var stripedState = stripedStates[i];
    var assignedColors = colorAssignments.filter(function(colorAssignment) {
      return colorAssignment.striped === stripedState && colorAssignment.colorIndex !== null;
    }).map(function(colorAssignment) {
      return colorAssignment.colorIndex;
    });
    if (assignedColors.length < colors.length) {
      for (var colorIndex = 0; colorIndex < colors.length; colorIndex++) {
        if (!(assignedColors.includes(colorIndex))) {
          return {
            colorIndex: colorIndex,
            striped: stripedState,
          }
        }
      }
    }
  }
  throw 'Could not find open color';
}

/**
 * @param {Array} colorAssignments
 * @return {Object|undefined} Color assignment object if found.
 */
function getAvailableColorAssignment(colorAssignments) {
  return colorAssignments.find(function(assignment) {
    return assignment.combination === null;
  });
}

/**
 * @param {Object} colorAssignment
 * @param {string} combination
 * @param {int} colorIndex
 * @param {boolean} striped
 */
function assignColor(colorAssignment, combination, colorIndex, striped) {
  colorAssignment.combination = combination;
  colorAssignment.colorIndex = colorIndex;
  colorAssignment.striped = striped;
  colorAssignment.readyForEviction = false;
}

/**
 * @param {int} colorIndex
 * @param {Array} colors
 * @return Color from a list
 */
function getColor(colorIndex, colors) {
  return '#' + colors[colorIndex];
}

/**
 * @param {string} color
 * @param {boolean} striped
 * @return Background color or pattern
 */
function getBackground(color, striped) {
  return striped ? getStripes(color) : color;
}

/**
 * @param {string} color
 * @return Canvas pattern from color
 */
function getStripes(color) {
  if (window.pattern && typeof window.pattern.draw === 'function') {
    return window.pattern.draw('diagonal', color);
  }
  return color;
}

/**
 * @param {boolean} striped
 * @return {Array|undefined} An array produces dashed lines on the chart
 */
function getBorderDash(striped) {
  return striped ? [5, 5] : undefined;
}

/**
 * @param {Array} years
 * @param {Array} rows
 * @param {Object} combination
 * @param {string} labelFallback
 * @param {string} color
 * @param {string} background
 * @param {Array} border
 * @return {Object} Dataset object for Chart.js
 */
function makeDataset(years, rows, combination, labelFallback, color, background, border, excess, showLine, spanGaps) {
  var dataset = getBaseDataset();
  return Object.assign(dataset, {
    label: getCombinationDescription(combination, labelFallback),
    disaggregation: combination,
    borderColor: color,
    backgroundColor: background,
    pointBorderColor: color,
    pointBackgroundColor: background,
    borderDash: border,
    borderWidth: 2,
    headline: false,
    pointStyle: 'circle',
    data: prepareDataForDataset(years, rows),
    excess: excess,
    spanGaps: spanGaps,
    showLine: showLine,
  });
}

/**
 * @return {Object} Starting point for a Chart.js dataset
 */
function getBaseDataset() {
  return Object.assign({}, {
    fill: false,
    pointHoverRadius: 5,
    pointHoverBorderWidth: 1,
    tension: 0,
    spanGaps: true,
    showLine: true,
    maxBarThickness: 150,
  });
}

/**
 * @param {Object} combination Key/value representation of a field combo
 * @param {string} fallback
 * @return {string} Human-readable description of combo
 */
function getCombinationDescription(combination, fallback) {
  var keys = Object.keys(combination);
  if (keys.length === 0) {
    return fallback;
  }
  return keys.map(function(key) {
    return translations.t(combination[key]);
  }).join(', ');
}

/**
 * @param {Array} years
 * @param {Array} rows
 * @return {Array} Prepared rows
 */
function prepareDataForDataset(years, rows) {
  return years.map(function(year) {
    var found = rows.find(function (row) {
      return row[YEAR_COLUMN] === year;
    });
    return found ? found[VALUE_COLUMN] : null;
  });
}

/**
 * @return {string} Hex number of headline color
 *
 * TODO: Make this dynamic to support high-contrast.
 */
function getHeadlineColor() {
  return HEADLINE_COLOR;
}

/**
 * @param {Array} years
 * @param {Array} rows
 * @param {string} label
 * @return {Object} Dataset object for Chart.js
 */
function makeHeadlineDataset(years, rows, label, showLine, spanGaps) {
  var dataset = getBaseDataset();
  return Object.assign(dataset, {
    label: label,
    borderColor: getHeadlineColor(),
    backgroundColor: getHeadlineColor(),
    pointBorderColor: getHeadlineColor(),
    pointBackgroundColor: getHeadlineColor(),
    borderWidth: 4,
    headline: true,
    pointStyle: 'circle',
    data: prepareDataForDataset(years, rows),
    showLine: showLine,
    spanGaps: spanGaps,
  });
}

  /**
   * @param {Array} graphStepsize Objects containing 'unit' and 'title'
   * @param {String} selectedUnit
   * @param {String} selectedSeries
   */
  function getGraphStepsize(graphStepsize, selectedUnit, selectedSeries) {
    return getMatchByUnitSeries(graphStepsize, selectedUnit, selectedSeries);
}

  /**
 * Model helper functions related to tables.
 */

/**
 * @param {Array} datasets
 * @param {Array} years
 * @return {Object} Object containing 'headings' and 'data'
 */
function tableDataFromDatasets(datasets, years) {
  return {
    headings: [YEAR_COLUMN].concat(datasets.map(function(ds) { return ds.label; })),
    data: years.map(function(year, index) {
      return [year].concat(datasets.map(function(ds) { return ds.data[index]; }));
    }),
  };
}

/**
 * @param {Array} rows
 * @param {string} selectedUnit
 * @return {Object} Object containing 'title', 'headings', and 'data'
 */
function getHeadlineTable(rows, selectedUnit) {
  return {
    title: 'Headline data',
    headings: selectedUnit ? [YEAR_COLUMN, UNIT_COLUMN, VALUE_COLUMN] : [YEAR_COLUMN, VALUE_COLUMN],
    data: rows.map(function (row) {
      return selectedUnit ? [row[YEAR_COLUMN], row[UNIT_COLUMN], row[VALUE_COLUMN]] : [row[YEAR_COLUMN], row[VALUE_COLUMN]];
    }),
  };
}

  /**
 * Model helper functions related to data and conversion.
 */

/**
 * @param {Object} data Object imported from JSON file
 * @param {Array} dropKeys Array of keys to drop from the rows
 * @return {Array} Rows
 */
function convertJsonFormatToRows(data, dropKeys) {
  var keys = Object.keys(data);
  if (keys.length === 0) {
    return [];
  }

  if (dropKeys && dropKeys.length > 0) {
    keys = keys.filter(function(key) {
      return !(dropKeys.includes(key));
    });
  }

  return data[keys[0]].map(function(item, index) {
    return _.zipObject(keys, keys.map(function(key) {
      return data[key][index];
    }));
  });
}

/**
 * @param {Array} selectableFields Field names
 * @param {Array} rows
 * @return {Array} Headline rows
 */
function getHeadline(selectableFields, rows) {
  return rows.filter(function (row) {
    return selectableFields.every(function(field) {
      return !row[field];
    });
  }).map(function (row) {
    // Remove null fields in each row.
    return _.pickBy(row, function(val) { return val !== null });
  });
}

/**
 * @param {Array} rows
 * @return {Array} Prepared rows
 */
function prepareData(rows, context) {
  return rows.map(function(item) {

    if (item[VALUE_COLUMN] != 0) {
      // For rounding, use a function that can be set on the global opensdg
      // object, for easier control: opensdg.dataRounding()
      if (typeof opensdg.dataRounding === 'function') {
        item.Value = opensdg.dataRounding(item.Value, context);
      }
    }

    // remove any undefined/null values:
    Object.keys(item).forEach(function(key) {
      if (item[key] === null || typeof item[key] === 'undefined') {
        delete item[key];
      }
    });

    return item;
  }, this);
}

/**
 * @param {Array} rows
 * @param {string} selectedUnit
 * @return {Array} Sorted rows
 */
function sortData(rows, selectedUnit) {
  var column = selectedUnit ? UNIT_COLUMN : YEAR_COLUMN;
  return _.sortBy(rows, column);
}

/**
 * @param {Array} precisions Objects containing 'unit' and 'title'
 * @param {String} selectedUnit
 * @param {String} selectedSeries
 * @return {int|false} number of decimal places, if any
 */
function getPrecision(precisions, selectedUnit, selectedSeries) {
  var match = getMatchByUnitSeries(precisions, selectedUnit, selectedSeries);
  return (match) ? match.decimals : false;
}

/**
 * @param {Object} data Object imported from JSON file
 * @return {Array} Rows
 */
function inputData(data) {
  var dropKeys = [];
  if (opensdg.ignoredDisaggregations && opensdg.ignoredDisaggregations.length > 0) {
    dropKeys = opensdg.ignoredDisaggregations;
  }
  return convertJsonFormatToRows(data, dropKeys);
}

/**
 * @param {Object} edges Object imported from JSON file
 * @return {Array} Rows
 */
function inputEdges(edges) {
  var edgesData = convertJsonFormatToRows(edges);
  if (opensdg.ignoredDisaggregations && opensdg.ignoredDisaggregations.length > 0) {
    var ignoredDisaggregations = opensdg.ignoredDisaggregations;
    edgesData = edgesData.filter(function(edge) {
      if (ignoredDisaggregations.includes(edge.To) || ignoredDisaggregations.includes(edge.From)) {
        return false;
      }
      return true;
    });
  }
  return edgesData;
}

/**
 * @param {Array} rows
 * @return {Array} Objects containing 'field' and 'value', to be placed in the footer.
 */
function getTimeSeriesAttributes(rows) {
  if (rows.length === 0) {
    return [];
  }
  var timeSeriesAttributes = [],
      possibleAttributes = [{"field":"COMMENT_TS","label":"indicator.footnote"},{"field":"DATA_LAST_UPDATE","label":"metadata_fields.national_data_update_url"}],
      firstRow = rows[0],
      firstRowKeys = Object.keys(firstRow);
  possibleAttributes.forEach(function(possibleAttribute) {
    var field = possibleAttribute.field;
    if (firstRowKeys.includes(field) && firstRow[field]) {
      timeSeriesAttributes.push({
        field: field,
        value: firstRow[field],
      });
    }
  });
  return timeSeriesAttributes;
}


  function deprecated(name) {
    return function() {
      console.log('The ' + name + ' function has been removed. Please update any overridden files.');
    }
  }

  return {
    UNIT_COLUMN: UNIT_COLUMN,
    SERIES_COLUMN: SERIES_COLUMN,
    GEOCODE_COLUMN: GEOCODE_COLUMN,
    YEAR_COLUMN: YEAR_COLUMN,
    VALUE_COLUMN: VALUE_COLUMN,
    GRAPH_TITLE_FROM_SERIES: GRAPH_TITLE_FROM_SERIES,
    convertJsonFormatToRows: convertJsonFormatToRows,
    getUniqueValuesByProperty: getUniqueValuesByProperty,
    dataHasUnits: dataHasUnits,
    dataHasGeoCodes: dataHasGeoCodes,
    dataHasSerieses: dataHasSerieses,
    getFirstUnitInData: getFirstUnitInData,
    getFirstSeriesInData: getFirstSeriesInData,
    getDataByUnit: getDataByUnit,
    getDataBySeries: getDataBySeries,
    getDataBySelectedFields: getDataBySelectedFields,
    getUnitFromStartValues: getUnitFromStartValues,
    getSeriesFromStartValues: getSeriesFromStartValues,
    selectFieldsFromStartValues: selectFieldsFromStartValues,
    selectMinimumStartingFields: selectMinimumStartingFields,
    fieldsUsedByUnit: fieldsUsedByUnit,
    fieldsUsedBySeries: fieldsUsedBySeries,
    dataHasUnitSpecificFields: dataHasUnitSpecificFields,
    dataHasSeriesSpecificFields: dataHasSeriesSpecificFields,
    getInitialFieldItemStates: getInitialFieldItemStates,
    validParentsByChild: validParentsByChild,
    getFieldNames: getFieldNames,
    getInitialAllowedFields: getInitialAllowedFields,
    prepareData: prepareData,
    getHeadline: getHeadline,
    sortData: sortData,
    getHeadlineTable: getHeadlineTable,
    removeOrphanSelections: removeOrphanSelections,
    getAllowedFieldsWithChildren: getAllowedFieldsWithChildren,
    getUpdatedFieldItemStates: getUpdatedFieldItemStates,
    fieldItemStatesForView: fieldItemStatesForView,
    getChartTitle: getChartTitle,
    getChartType: getChartType,
    getCombinationData: getCombinationData,
    getDatasets: getDatasets,
    tableDataFromDatasets: tableDataFromDatasets,
    sortFieldNames: typeof sortFieldNames !== 'undefined' ? sortFieldNames : function() {},
    sortFieldValueNames: typeof sortFieldValueNames !== 'undefined' ? sortFieldValueNames : function() {},
    getPrecision: getPrecision,
    getGraphLimits: getGraphLimits,
    getGraphAnnotations: getGraphAnnotations,
    getColumnsFromData: getColumnsFromData,
    getGraphStepsize: getGraphStepsize,
    inputEdges: inputEdges,
    getTimeSeriesAttributes: getTimeSeriesAttributes,
    inputData: inputData,
  }
})();

  this.helpers = helpers;

  // events:
  this.onDataComplete = new event(this);
  this.onFieldsComplete = new event(this);
  this.onUnitsComplete = new event(this);
  this.onUnitsSelectedChanged = new event(this);
  this.onSeriesesComplete = new event(this);
  this.onSeriesesSelectedChanged = new event(this);
  this.onFieldsStatusUpdated = new event(this);
  this.onFieldsCleared = new event(this);
  this.onSelectionUpdate = new event(this);

  // general members:
  var that = this;
  this.data = helpers.inputData(options.data);
  this.edgesData = helpers.inputEdges(options.edgesData);
  this.hasHeadline = true;
  this.country = options.country;
  this.indicatorId = options.indicatorId;
  this.shortIndicatorId = options.shortIndicatorId;
  this.chartTitle = options.chartTitle,
  this.chartTitles = options.chartTitles;
  this.chartSubtitle = options.chartSubtitle;
  this.chartSubtitles = options.chartSubtitles;
  this.graphType = options.graphType;
  this.graphTypes = options.graphTypes;
  this.measurementUnit = options.measurementUnit;
  this.xAxisLabel = options.xAxisLabel;
  this.startValues = options.startValues;
  this.showData = options.showData;
  this.showInfo = options.showInfo;
  this.selectedFields = [];
  this.allowedFields = [];
  this.selectedUnit = undefined;
  this.fieldsByUnit = undefined;
  this.dataHasUnitSpecificFields = false;
  this.selectedSeries = undefined;
  this.fieldsBySeries = undefined;
  this.dataHasSeriesSpecificFields = false;
  this.fieldValueStatuses = [];
  this.validParentsByChild = {};
  this.hasGeoData = false;
  this.showMap = options.showMap;
  this.graphLimits = options.graphLimits;
  this.stackedDisaggregation = options.stackedDisaggregation;
  this.showLine = options.showLine; // ? options.showLine : true;
  this.spanGaps = options.spanGaps;
  this.graphAnnotations = options.graphAnnotations;
  this.graphTargetLines = options.graphTargetLines;
  this.graphSeriesBreaks = options.graphSeriesBreaks;
  this.graphErrorBars = options.graphErrorBars;
  this.graphTargetPoints = options.graphTargetPoints;
  this.graphTargetLabels = options.graphTargetLabels;
  this.indicatorDownloads = options.indicatorDownloads;
  this.compositeBreakdownLabel = options.compositeBreakdownLabel;
  this.precision = options.precision;
  this.dataSchema = options.dataSchema;
  this.graphStepsize = options.graphStepsize;
  this.proxy = options.proxy;
  this.proxySerieses = (this.proxy === 'both') ? options.proxySeries : [];

  this.initialiseUnits = function() {
    if (this.hasUnits) {
      this.units = helpers.getUniqueValuesByProperty(helpers.UNIT_COLUMN, this.data);
      helpers.sortFieldValueNames(helpers.UNIT_COLUMN, this.units, this.dataSchema);
      this.selectedUnit = this.units[0];
      this.fieldsByUnit = helpers.fieldsUsedByUnit(this.units, this.data, this.allColumns);
      this.dataHasUnitSpecificFields = helpers.dataHasUnitSpecificFields(this.fieldsByUnit);
    }
  }

  this.refreshSeries = function() {
    if (this.hasSerieses) {
      if (helpers.GRAPH_TITLE_FROM_SERIES) {
        this.chartTitle = this.selectedSeries;
        this.chartSubtitle = helpers.getChartTitle(this.chartSubtitle, this.chartSubtitles, this.selectedUnit, this.selectedSeries);
      }
      this.data = helpers.getDataBySeries(this.allData, this.selectedSeries);
      this.years = helpers.getUniqueValuesByProperty(helpers.YEAR_COLUMN, this.data).sort();
      this.fieldsBySeries = helpers.fieldsUsedBySeries(this.serieses, this.data, this.allColumns);
      this.dataHasSeriesSpecificFields = helpers.dataHasSeriesSpecificFields(this.fieldsBySeries);
    }
  }

  this.initialiseFields = function() {
    this.fieldItemStates = helpers.getInitialFieldItemStates(this.data, this.edgesData, this.allColumns, this.dataSchema);
    this.validParentsByChild = helpers.validParentsByChild(this.edgesData, this.fieldItemStates, this.data);
    this.selectableFields = helpers.getFieldNames(this.fieldItemStates);
    this.allowedFields = helpers.getInitialAllowedFields(this.selectableFields, this.edgesData);
  }

  // Before continuing, we may need to filter by Series, so set up all the Series stuff.
  this.allData = helpers.prepareData(this.data, { indicatorId: this.indicatorId });
  this.allColumns = helpers.getColumnsFromData(this.allData);
  this.hasSerieses = helpers.dataHasSerieses(this.allColumns);
  this.serieses = this.hasSerieses ? helpers.getUniqueValuesByProperty(helpers.SERIES_COLUMN, this.allData) : [];
  this.hasStartValues = Array.isArray(this.startValues) && this.startValues.length > 0;
  if (this.hasSerieses) {
    helpers.sortFieldValueNames(helpers.SERIES_COLUMN, this.serieses, this.dataSchema);
    this.selectedSeries = this.serieses[0];
    if (this.hasStartValues) {
      this.selectedSeries = helpers.getSeriesFromStartValues(this.startValues) || this.selectedSeries;
    }
    this.refreshSeries();
  }
  else {
    this.data = this.allData;
    this.years = helpers.getUniqueValuesByProperty(helpers.YEAR_COLUMN, this.data).sort();
  }

  // calculate some initial values:
  this.hasGeoData = helpers.dataHasGeoCodes(this.allColumns);
  this.hasUnits = helpers.dataHasUnits(this.allColumns);
  this.initialiseUnits();
  this.initialiseFields();
  this.colors = opensdg.chartColors(this.indicatorId);
  this.maxDatasetCount = 2 * this.colors.length;
  this.colorAssignments = [];

  this.clearSelectedFields = function() {
    this.selectedFields = [];
    this.getData();
    this.onFieldsCleared.notify();
  };

  this.updateFieldStates = function(selectedFields) {
    this.selectedFields = helpers.removeOrphanSelections(selectedFields, this.edgesData);
    this.allowedFields = helpers.getAllowedFieldsWithChildren(this.selectableFields, this.edgesData, selectedFields);
    this.fieldItemStates = helpers.getUpdatedFieldItemStates(this.fieldItemStates, this.edgesData, selectedFields, this.validParentsByChild);
    this.onSelectionUpdate.notify({
      selectedFields: this.selectedFields,
      allowedFields: this.allowedFields
    });
  }

  this.updateSelectedFields = function (selectedFields) {
    this.updateFieldStates(selectedFields);
    this.getData();
  };

  this.updateChartTitle = function() {
    this.chartTitle = helpers.getChartTitle(this.chartTitle, this.chartTitles, this.selectedUnit, this.selectedSeries);
  }

  this.updateChartSubtitle = function() {
    this.chartSubtitle = helpers.getChartTitle(this.chartSubtitle, this.chartSubtitles, this.selectedUnit, this.selectedSeries);
  }

  this.updateChartType = function() {
    this.graphType = helpers.getChartType(this.graphType, this.graphTypes, this.selectedUnit, this.selectedSeries);
  }

  this.updateSelectedUnit = function(selectedUnit) {
    this.selectedUnit = selectedUnit;
    this.getData({
      updateFields: this.dataHasUnitSpecificFields
    });
    this.onUnitsSelectedChanged.notify(selectedUnit);
  };

  this.updateSelectedSeries = function(selectedSeries) {
    // Updating the Series is akin to loading a whole new indicator, so
    // here we re-initialise most everything on the page.
    this.selectedSeries = selectedSeries;
    this.refreshSeries();
    this.clearSelectedFields();
    this.initialiseUnits();
    this.initialiseFields();
    this.getData({ updateFields: true, changingSeries: true });
    this.onSeriesesSelectedChanged.notify(selectedSeries);
  };

  this.getData = function(options) {
    options = Object.assign({
      initial: false,
      updateFields: false,
      changingSeries: false,
    }, options);

    var headlineUnfiltered = helpers.getHeadline(this.selectableFields, this.data);
    var headline;
    if (this.hasUnits && !this.hasSerieses) {
      headline = helpers.getDataByUnit(headlineUnfiltered, this.selectedUnit);
    }
    else if (this.hasSerieses && !this.hasUnits) {
      headline = helpers.getDataBySeries(headlineUnfiltered, this.selectedSeries);
    }
    else if (this.hasSerieses && this.hasUnits) {
      headline = helpers.getDataByUnit(headlineUnfiltered, this.selectedUnit);
      headline = helpers.getDataBySeries(headline, this.selectedSeries);
    }
    else {
      headline = headlineUnfiltered;
    }

    // If this is the initial load, check for special cases.
    var selectionUpdateNeeded = false;
    if (options.initial || options.changingSeries) {
      // Decide on a starting unit.
      if (this.hasUnits) {
        var startingUnit = this.selectedUnit;
        if (this.hasStartValues) {
          var unitInStartValues = helpers.getUnitFromStartValues(this.startValues);
          if (unitInStartValues && this.units.includes(unitInStartValues)) {
            startingUnit = unitInStartValues;
          }
        }
        else {
          // If our selected unit causes the headline to be empty, change it
          // to the first one available that would work.
          if (headlineUnfiltered.length > 0 && headline.length === 0) {
            startingUnit = helpers.getFirstUnitInData(headlineUnfiltered);
          }
        }
        // Re-query the headline if needed.
        if (this.selectedUnit !== startingUnit) {
          headline = helpers.getDataByUnit(headlineUnfiltered, startingUnit);
        }
        this.selectedUnit = startingUnit;
      }

      // Decide on a starting series.
      if (this.hasSerieses && !options.changingSeries) {
        var startingSeries = this.selectedSeries;
        if (this.hasStartValues) {
          var seriesInStartValues = helpers.getSeriesFromStartValues(this.startValues);
          if (seriesInStartValues) {
            startingSeries = seriesInStartValues;
          }
        }
        else {
          // If our selected series causes the headline to be empty, change it
          // to the first one available that would work.
          if (headlineUnfiltered.length > 0 && headline.length === 0) {
            startingSeries = helpers.getFirstSeriesInData(headlineUnfiltered);
          }
        }
        // Re-query the headline if needed.
        if (this.selectedSeries !== startingSeries) {
          headline = helpers.getDataBySeries(headlineUnfiltered, startingSeries);
        }
        this.selectedSeries = startingSeries;
      }

      // Decide on starting field values if not changing series.
      var startingFields = this.selectedFields;
      if (this.hasStartValues && !options.changingSeries) {
        startingFields = helpers.selectFieldsFromStartValues(this.startValues, this.selectableFields);
      }
      else {
        if (headline.length === 0) {
          startingFields = helpers.selectMinimumStartingFields(this.data, this.selectableFields, this.selectedUnit);
        }
      }
      if (startingFields.length > 0) {
        this.selectedFields = startingFields;
        selectionUpdateNeeded = true;
      }

      this.onUnitsComplete.notify({
        units: this.units,
        selectedUnit: this.selectedUnit
      });

      this.onSeriesesComplete.notify({
        serieses: this.serieses,
        selectedSeries: this.selectedSeries,
        proxySerieses: this.proxySerieses,
      });
    }

    if (options.initial || options.updateFields) {
      this.onFieldsComplete.notify({
        fields: helpers.fieldItemStatesForView(
          this.fieldItemStates,
          this.fieldsByUnit,
          this.selectedUnit,
          this.dataHasUnitSpecificFields,
          this.fieldsBySeries,
          this.selectedSeries,
          this.dataHasSeriesSpecificFields,
          this.selectedFields,
          this.edgesData,
          this.compositeBreakdownLabel
        ),
        allowedFields: this.allowedFields,
        edges: this.edgesData,
        hasGeoData: this.hasGeoData,
        startValues: this.startValues,
        indicatorId: this.indicatorId,
        showMap: this.showMap,
        precision: helpers.getPrecision(this.precision, this.selectedUnit, this.selectedSeries),
        precisionItems: this.precision,
        dataSchema: this.dataSchema,
        chartTitles: this.chartTitles,
        chartSubtitles: this.chartSubtitles,
        graphStepsize: helpers.getGraphStepsize(this.graphStepsize, this.selectedUnit, this.selectedSeries),
        proxy: this.proxy,
        proxySerieses: this.proxySerieses,
      });
    }

    if (selectionUpdateNeeded || options.updateFields) {
      this.updateFieldStates(this.selectedFields);
    }

    var filteredData = helpers.getDataBySelectedFields(this.data, this.selectedFields);
    if (this.hasUnits) {
      filteredData = helpers.getDataByUnit(filteredData, this.selectedUnit);
    }

    var timeSeriesAttributes = [];
    if (filteredData.length > 0) {
      timeSeriesAttributes = helpers.getTimeSeriesAttributes(filteredData);
    }
    else if (headline.length > 0) {
      timeSeriesAttributes = helpers.getTimeSeriesAttributes(headline);
    }

    filteredData = helpers.sortData(filteredData, this.selectedUnit);
    if (headline.length > 0) {
      headline = helpers.sortData(headline, this.selectedUnit);
    }

    var combinations = helpers.getCombinationData(this.selectedFields, this.dataSchema);
    var datasets = helpers.getDatasets(headline, filteredData, combinations, this.years, translations.data.total, this.colors, this.selectableFields, this.colorAssignments, this.showLine, this.spanGaps );
    var selectionsTable = helpers.tableDataFromDatasets(datasets, this.years);

    var datasetCountExceedsMax = false;
    // restrict count if it exceeds the limit:
    if(datasets.length > this.maxDatasetCount) {
      datasetCountExceedsMax = true;
    }

    this.updateChartTitle();
    this.updateChartSubtitle();
    this.updateChartType();

    this.onFieldsStatusUpdated.notify({
      data: this.fieldItemStates,
      // TODO: Why is selectionStates not used?
      selectionStates: []
    });

    this.onDataComplete.notify({
      datasetCountExceedsMax: datasetCountExceedsMax,
      datasets: datasets.filter(function(dataset) { return dataset.excess !== true }),
      labels: this.years,
      headlineTable: helpers.getHeadlineTable(headline, this.selectedUnit),
      selectionsTable: selectionsTable,
      indicatorId: this.indicatorId,
      shortIndicatorId: this.shortIndicatorId,
      selectedUnit: this.selectedUnit,
      selectedSeries: this.selectedSeries,
      graphLimits: helpers.getGraphLimits(this.graphLimits, this.selectedUnit, this.selectedSeries),
      stackedDisaggregation: this.stackedDisaggregation,
      graphAnnotations: helpers.getGraphAnnotations(this.graphAnnotations, this.selectedUnit, this.selectedSeries, this.graphTargetLines, this.graphSeriesBreaks, this.graphErrorBars, this.graphTargetPoints, this.graphTargetLabels),
      chartTitle: this.chartTitle,
      chartSubtitle: this.chartSubtitle,
      chartType: this.graphType,
      indicatorDownloads: this.indicatorDownloads,
      precision: helpers.getPrecision(this.precision, this.selectedUnit, this.selectedSeries),
      graphStepsize: helpers.getGraphStepsize(this.graphStepsize, this.selectedUnit, this.selectedSeries),
      timeSeriesAttributes: timeSeriesAttributes,
      isProxy: this.proxy === 'proxy' || this.proxySerieses.includes(this.selectedSeries),
    });
  };
};

indicatorModel.prototype = {
  initialise: function () {
    this.getData({
      initial: true
    });
  },
  getData: function () {
    this.getData();
  }
};
var mapView = function () {

  "use strict";

  this.initialise = function(indicatorId, precision, precisionItems, decimalSeparator, thousandsSeparator, dataSchema, viewHelpers, modelHelpers, chartTitles, chartSubtitles, startValues, proxy, proxySerieses) {
    $('.map').show();
    $('#map').sdgMap({
      indicatorId: indicatorId,
      mapOptions: {"disaggregation_controls":true,"minZoom":5,"maxZoom":10,"tileURL":"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png","tileOptions":{"id":"mapbox.light","accessToken":"pk.eyJ1IjoibW9ib3NzZSIsImEiOiJjazU1M2trazQwYnFwM2trYmdwNm9rOWxkIn0.u36w-RJPqoTGmivl_zED1w","attribution":"<a href=\"https://www.openstreetmap.org/copyright\">&copy; OpenStreetMap</a> contributors |<br class=\"visible-xs\"> <a href=\"https://www.bkg.bund.de\">&copy; GeoBasis-De / BKG 2024</a> |<br class=\"hidden-lg\"> <a href=\"https://www.destatis.de/DE/Home/_inhalt.html\">&copy; Statistisches Bundesamt (Destatis), 2024</a>"},"colorRange":[["#FCE9EB","#F7BDC4","#F2929D","#ED6676","#E83A4F","#E5243B","#B71D2F","#891623","#5C0E18","#2E070C"],["#FCF8EB","#F7E9C2","#F2DB9A","#EDCD72","#E8BE49","#E5B735","#CEA530","#A08025","#735C1B","#453710"],["#EDF5EB","#C9E2C3","#A6CF9C","#82BC74","#5EA94C","#4C9F38","#3D7F2D","#2E5F22","#1E4016","#0F200B"],["#F9E8EA","#EEBAC0","#E28C96","#D65E6C","#CB3042","#C5192D","#9E1424","#760F1B","#4F0A12","#270509"],["#FFEBE9","#FFC4BC","#FF9D90","#FF7564","#FF4E37","#FF3A21","#CC2E1A","#992314","#66170D","#330C07"],["#E9F8FB","#BEEBF6","#93DEF0","#67D1EA","#3CC4E5","#26BDE2","#1E97B5","#177188","#0F4C5A","#08262D"],["#FFF9E7","#FEEDB6","#FEE185","#FDD554","#FCC923","#FCC30B","#CA9C09","#977507","#654E04","#322702"],["#F6E8EC","#E3BAC6","#D18CA1","#BE5E7B","#AB3055","#A21942","#821435","#610F28","#410A1A","#20050D"],["#FFF0E9","#FED2BE","#FEB492","#FE9666","#FD783B","#FD6925","#CA541E","#983F16","#652A0F","#331507"],["#FCE7F0","#F5B8D1","#EE89B3","#E75A95","#E02B76","#DD1367","#B10F52","#850B3E","#580829","#2C0415"],["#FFF5E6","#FEE2B3","#FECE80","#FEBA4D","#FDA71A","#FD9D00","#CA7E00","#985E00","#653F00","#331F00"],["#FAF5EA","#EFE0C0","#E4CC96","#D9B86C","#CEA342","#C9992D","#A17A24","#795C1B","#503D12","#281F09"],["#ECF2EC","#C5D8C7","#9FBFA2","#79A57C","#528B57","#3F7E44","#326536","#264C29","#19321B","#0D190E"],["#E7F5FB","#B6E0F4","#85CBEC","#54B6E4","#23A1DD","#0A97D9","#0879AE","#065B82","#043C57","#021E2B"],["#EEF9EA","#CCECBF","#ABE095","#89D36B","#67C640","#56C02B","#459A22","#34731A","#224D11","#112609"],["#E6F0F5","#B3D2E2","#80B4CE","#4D95BA","#1A77A7","#00689D","#00537E","#003E5E","#002A3F","#00151F"],["#E8EDF0","#BAC8D2","#8CA4B5","#5E7F97","#305A79","#19486A","#143A55","#0F2B40","#0A1D2A","#050E15"]],"noValueColor":"#f0f0f0","styleNormal":{"weight":1,"opacity":1,"color":"#888","fillOpacity":0.7},"styleHighlighted":{"weight":1,"opacity":1,"color":"#111","fillOpacity":0.7},"styleStatic":{"weight":2,"opacity":1,"fillOpacity":0,"color":"#172d44","dashArray":55}},
      mapLayers: [{"serviceUrl":"https://sdgtestenvironment.github.io/dns-indicators/assets/maps/boundaries.geojson","min_zoom":4.5,"max_zoom":6.5,"staticBorders":true,"subfolder":"laender","label":"indicator.map"},{"serviceUrl":"https://sdgtestenvironment.github.io/dns-indicators/assets/maps/boundariesKrs.geojson","min_zoom":7,"max_zoom":11,"staticBorders":false,"subfolder":"kreise","label":"indicator.map"}],
      precision: precision,
      precisionItems: precisionItems,
      decimalSeparator: decimalSeparator,
      thousandsSeparator: thousandsSeparator,
      dataSchema: dataSchema,
      viewHelpers: viewHelpers,
      modelHelpers: modelHelpers,
      chartTitles: chartTitles,
      chartSubtitles: chartSubtitles,
      proxy: proxy,
      proxySerieses: proxySerieses,
      startValues: startValues,
    });
  };
};
var indicatorView = function (model, options) {

    "use strict";

    var MODEL = model,
        VIEW = this,
        OPTIONS = options;

    var helpers = 
(function() {

  var HIDE_SINGLE_SERIES = false;
var HIDE_SINGLE_UNIT = true;
var PROXY_PILL = '<span aria-describedby="proxy-description" class="proxy-pill">' + translations.t("Proxy") + '</span>';

  /**
 * @param {Object} args
 * @return null
 */
function initialiseFields(args) {
    var fieldsContainValues = args.fields.some(function (field) {
        return field.values.length > 0;
    });
    if (fieldsContainValues) {
        var template = _.template($("#item_template").html());

        if (!$('button#clear').length) {
            $('<button id="clear" disabled="disabled" aria-disabled="true" class="disabled">' + translations.indicator.clear_selections + ' <i class="fa fa-remove"></i></button>').insertBefore('#fields');
        }

        $('#fields').html(template({
            fields: args.fields,
            allowedFields: args.allowedFields,
            childFields: _.uniq(args.edges.map(function (edge) { return edge.To })),
            edges: args.edges
        }));

        $(OPTIONS.rootElement).removeClass('no-fields');

    } else {
        $(OPTIONS.rootElement).addClass('no-fields');
    }
}

/**
 * @return null
 */
function updateWithSelectedFields() {
    MODEL.updateSelectedFields(_.chain(_.map($('#fields input:checked'), function (fieldValue) {
        return {
            value: $(fieldValue).val(),
            field: $(fieldValue).data('field')
        };
    })).groupBy('field').map(function (value, key) {
        return {
            field: key,
            values: _.map(value, 'value')
        };
    }).value());
}

/**
 * @param {Element} fieldGroupElement
 * @return null
 */
function sortFieldGroup(fieldGroupElement) {
    var sortLabels = function (a, b) {
        var aObj = { hasData: $(a).attr('data-has-data'), text: $(a).text() };
        var bObj = { hasData: $(b).attr('data-has-data'), text: $(b).text() };
        if (aObj.hasData == bObj.hasData) {
            return (aObj.text > bObj.text) ? 1 : -1;
        }
        return (aObj.hasData < bObj.hasData) ? 1 : -1;
    };
    fieldGroupElement.find('label')
        .sort(sortLabels)
        .appendTo(fieldGroupElement.find('#indicatorData .variable-options'));
}

/**
 * @param {Array} tsAttributeValues
 *   Array of objects containing 'field' and 'value'.
 * @return null
 */
function updateTimeSeriesAttributes(tsAttributeValues) {
    var timeSeriesAttributes = [{"field":"COMMENT_TS","label":"indicator.footnote"},{"field":"DATA_LAST_UPDATE","label":"metadata_fields.national_data_update_url"}];
    timeSeriesAttributes.forEach(function(tsAttribute) {
        var field = tsAttribute.field,
            valueMatch = tsAttributeValues.find(function(tsAttributeValue) {
                return tsAttributeValue.field === field;
            }),
            value = (valueMatch) ? valueMatch.value : '',
            $labelElement = $('dt[data-ts-attribute="' + field + '"]'),
            $valueElement = $('dd[data-ts-attribute="' + field + '"]');

        if (!value) {
            $labelElement.hide();
            $valueElement.hide();
        }
        else {
            $labelElement.show();
            $valueElement.show().text(translations.t(value));
        }
    });
}

  /**
 * @param {Object} args
 * @return null
 */
function initialiseUnits(args) {
    var template = _.template($('#units_template').html()),
        units = args.units || [],
        selectedUnit = args.selectedUnit || null;

    $('#units').html(template({
        units: units,
        selectedUnit: selectedUnit
    }));

    var noUnits = (units.length < 1);
    if (HIDE_SINGLE_UNIT) {
        noUnits = (units.length < 2);
    }

    if (noUnits) {
        $(OPTIONS.rootElement).addClass('no-units');
    }
    else {
        $(OPTIONS.rootElement).removeClass('no-units');
    }
}

/**
 * @param {String} selectedUnit
 * @return null
 */
 function updateUnitElements(selectedUnit) {
    var hasUnit = typeof selectedUnit !== 'undefined';
    var fallback = MODEL.measurementUnit;
    if (hasUnit || fallback) {
        var unitToDisplay = selectedUnit || fallback;
        $('.data-controlled-footer-field.unit-from-data').show();
        $('dd.data-controlled-footer-field.unit-from-data').text(translations.t(unitToDisplay));
    }
    else {
        $('.data-controlled-footer-field.unit-from-data').hide();
    }
}

  /**
 * @param {Object} args
 * @return null
 */
function initialiseSerieses(args) {
    var activeSeriesInput = $('#serieses').find(document.activeElement),
        seriesWasFocused = (activeSeriesInput.length > 0) ? true : false,
        focusedValue = (seriesWasFocused) ? $(activeSeriesInput).val() : null,
        templateElement = $('#series_template');
    if (templateElement.length > 0) {
        var template = _.template(templateElement.html()),
            serieses = args.serieses || [],
            selectedSeries = args.selectedSeries || null,
            proxySerieses = args.proxySerieses || [];
        $('#serieses').html(template({
            serieses: serieses,
            selectedSeries: selectedSeries,
            proxySerieses: proxySerieses,
            proxyPill: PROXY_PILL,
        }));

        var noSerieses = (serieses.length < 1);
        if (HIDE_SINGLE_SERIES) {
            noSerieses = (serieses.length < 2);
        }

        if (noSerieses) {
            $(OPTIONS.rootElement).addClass('no-serieses');
        }
        else {
            $(OPTIONS.rootElement).removeClass('no-serieses');
        }
    }
    // Return focus if necessary.
    if (seriesWasFocused) {
        $('#serieses :input[value="' + focusedValue + '"]').focus();
    }
}

  /**
 * @param {Object} config
 * @param {Object} info
 * @return null
 */
function alterChartConfig(config, info) {
    opensdg.chartConfigAlterations.forEach(function (callback) {
        callback(config, info);
    });
}

/**
 * @param {String} chartTitle
 * @return null
 */
function updateChartTitle(chartTitle, isProxy) {
    if (typeof chartTitle !== 'undefined') {
      if (isProxy) {
          chartTitle += ' ' + PROXY_PILL;
      }
      $('.chart-title').html(chartTitle);
    }
}

/**
 * @param {String} chartSubtitle
 * @return null
 */
function updateChartSubtitle(chartSubtitle) {
    if (typeof chartSubtitle !== 'undefined') {
        $('.chart-subtitle').text(chartSubtitle);
    }
}

/**
 * @param {Array} oldDatasets
 * @param {Array} newDatasets
 * @return null
 */
function updateIndicatorDataViewStatus(oldDatasets, newDatasets) {
    var status = '',
        hasData = newDatasets.length > 0,
        dataAdded = newDatasets.length > oldDatasets.length,
        dataRemoved = newDatasets.length < oldDatasets.length,
        getDatasetLabel = function (dataset) { return dataset.label; },
        oldLabels = oldDatasets.map(getDatasetLabel),
        newLabels = newDatasets.map(getDatasetLabel);

    if (!hasData) {
        status = translations.indicator.announce_data_not_available;
    }
    else if (dataAdded) {
        status = translations.indicator.announce_data_added;
        var addedLabels = [];
        newLabels.forEach(function (label) {
            if (!oldLabels.includes(label)) {
                addedLabels.push(label);
            }
        });
        status += ' ' + addedLabels.join(', ');
    }
    else if (dataRemoved) {
        status = translations.indicator.announce_data_removed;
        var removedLabels = [];
        oldLabels.forEach(function (label) {
            if (!newLabels.includes(label)) {
                removedLabels.push(label);
            }
        });
        status += ' ' + removedLabels.join(', ');
    }

    var current = $('#indicator-data-view-status').text();
    if (current != status) {
        $('#indicator-data-view-status').text(status);
    }
}

/**
 * @param {String} contrast
 * @param {Object} chartInfo
 * @return null
 */
function updateHeadlineColor(contrast, chartInfo, indicatorId) {
    var goalNumber = parseInt(indicatorId.slice(indicatorId.indexOf('_')+1,indicatorId.indexOf('-')));
    if (chartInfo.data.datasets.length > 0) {
        var firstDataset = chartInfo.data.datasets[0];
        var isHeadline = (typeof firstDataset.disaggregation === 'undefined');
        if (isHeadline) {
            var newColor = getHeadlineColor(contrast, goalNumber);
            firstDataset.backgroundColor = newColor;
            firstDataset.borderColor = newColor;
            firstDataset.pointBackgroundColor = newColor;
            firstDataset.pointBorderColor = newColor;
        }
    }
}

/**
 * @param {String} contrast
 * @return {String} The headline color in hex form.
 */
//Override: No Headline Color
//function getHeadlineColor(contrast) {
    //return isHighContrast(contrast) ? '#FFDD00' : '#b8b8b8';
function getHeadlineColor(contrast, goalNumber) {

  var headlineColors = ["#e5243b", "#dda63a", "#4c9f38", "#c5192d", "#ff3a21", "#26bde2", "#fcc30b", "#a21942", "#fd6925", "#dd1367", "#fd9d24", "#bf8b2e", "#3f7e44", "#0a97d9", "#56c02b", "#00689d", "#19486a"];
  var headlineColor = headlineColors[goalNumber-1];
  var htmlString = '' + headlineColor + '';
  console.log("goalNumber: ", htmlString);
    return isHighContrast(contrast) ? '#FFDD00' : htmlString;
}

/**
 * @param {String} contrast
 * @return {String} The grid color in hex form.
 */
function getGridColor(contrast) {
    return isHighContrast(contrast) ? '#222' : '#ddd';
};

/**
 * @param {String} contrast
 * @return {String} The tick color in hex form.
 */
function getTickColor(contrast) {
    return isHighContrast(contrast) ? '#fff' : '#000';
}

function getChartConfig(chartInfo) {
    var chartType = chartInfo.chartType;
    if (typeof opensdg.chartTypes[chartType] === 'undefined') {
        console.log('Unknown chart type: ' + chartType + '. Falling back to "line".');
        chartType = 'line';
    }
    return opensdg.chartTypes[chartType](chartInfo);
}

function setPlotEvents(chartInfo) {
    window.addEventListener('contrastChange', function (e) {
        var gridColor = getGridColor(e.detail);
        var tickColor = getTickColor(e.detail);
        updateHeadlineColor(e.detail, VIEW._chartInstance, chartInfo.indicatorId);
        updateGraphAnnotationColors(e.detail, VIEW._chartInstance);
        VIEW._chartInstance.options.scales.y.title.color = tickColor;
        VIEW._chartInstance.options.scales.x.title.color = tickColor;
        VIEW._chartInstance.options.scales.y.ticks.color = tickColor;
        VIEW._chartInstance.options.scales.x.ticks.color = tickColor;
        VIEW._chartInstance.options.scales.y.grid.color = function(line) {
            return (line.index === 0) ? tickColor : gridColor;
        };
        VIEW._chartInstance.options.scales.x.grid.color = function(line) {
            return (line.index === 0) ? tickColor : 'transparent';
        };

        VIEW._chartInstance.update();
        $(VIEW._legendElement).html(generateChartLegend(VIEW._chartInstance));
    });

    createDownloadButton(chartInfo.selectionsTable, 'Chart', chartInfo.indicatorId, '#chartSelectionDownload');
    createSourceButton(chartInfo.shortIndicatorId, '#chartSelectionDownload');
    createIndicatorDownloadButtons(chartInfo.indicatorDownloads, chartInfo.shortIndicatorId, '#chartSelectionDownload');

    $("#btnSave").click(function () {
        var filename = chartInfo.indicatorId + '.png',
            element = document.getElementById('chart-canvas'),
            height = element.clientHeight + 50,
            width = element.clientWidth + 50;
        var options = {
            // These options fix the height, width, and position.
            height: height,
            width: width,
            windowHeight: height,
            windowWidth: width,
            x: 0,
            y: 0,
            scrollX: 0,
            scrollY: 0,
            scale: 2,
            backgroundColor: isHighContrast() ? '#000000' : '#FFFFFF',
            // Allow a chance to alter the screenshot's HTML.
            onclone: function (clone) {
                // Add a body class so that the screenshot style can be custom.
                clone.body.classList.add('image-download-in-progress');
            },
            // Decide which elements to skip.
            ignoreElements: function (el) {
                // Keep all style, head, and link elements.
                var keepTags = ['STYLE', 'HEAD', 'LINK'];
                if (keepTags.indexOf(el.tagName) !== -1) {
                    return false;
                }
                // Keep all elements contained by (or containing) the screenshot
                // target element.
                if (element.contains(el) || el.contains(element)) {
                    return false;
                }
                // Leave out everything else.
                return true;
            }
        };
        // First convert the target to a canvas.
        html2canvas(element, options).then(function (canvas) {
            // Then download that canvas as a PNG file.
            canvas.toBlob(function (blob) {
                saveAs(blob, filename);
            });
        });
    });
}

/**
 * @param {Object} chartInfo
 * @return null
 */
function createPlot(chartInfo) {

    var chartConfig = getChartConfig(chartInfo);
    alterChartConfig(chartConfig, chartInfo);
    if (isHighContrast()) {
        updateGraphAnnotationColors('high', chartConfig);
        //Override: No headline color
        //updateHeadlineColor('high', chartConfig);
        updateHeadlineColor('high', chartConfig, chartInfo.indicatorId);

    }
    else {
      //Override: No headline color
      //updateHeadlineColor('default', chartConfig);
      updateHeadlineColor('default', chartConfig, chartInfo.indicatorId);
    }
    refreshChartLineWrapping(chartConfig);

    VIEW._chartInstance = new Chart($(OPTIONS.rootElement).find('canvas'), chartConfig);
    $(VIEW._legendElement).html(generateChartLegend(VIEW._chartInstance));
};

/**
 * @param {Object} chartInfo
 * @return null
 */
 function updatePlot(chartInfo) {
    // If we have changed type, we will need to destroy and recreate the chart.
    // So we can abort here.
    var updatedConfig = getChartConfig(chartInfo);
    if (updatedConfig.type !== VIEW._chartInstance.config.type) {
        VIEW._chartInstance.destroy();
        createPlot(chartInfo);
        return;
    }

    updateIndicatorDataViewStatus(VIEW._chartInstance.data.datasets, updatedConfig.data.datasets);
    // Override: No headline color
    //updateHeadlineColor(isHighContrast() ? 'high' : 'default', updatedConfig);
    updateHeadlineColor(isHighContrast() ? 'high' : 'default', updatedConfig, chartInfo.indicatorId);

    if (chartInfo.selectedUnit) {
        updatedConfig.options.scales.y.title.text = translations.t(chartInfo.selectedUnit);
    }

    alterChartConfig(updatedConfig, chartInfo);
    refreshChartLineWrapping(updatedConfig);
    VIEW._chartInstance.config.type = updatedConfig.type;
    VIEW._chartInstance.data.datasets = updatedConfig.data.datasets;
    VIEW._chartInstance.data.labels = updatedConfig.data.labels;
    VIEW._chartInstance.options = updatedConfig.options;

    // The following is needed in our custom "rescaler" plugin.
    VIEW._chartInstance.data.allLabels = VIEW._chartInstance.data.labels.slice(0);

    VIEW._chartInstance.update();

    $(VIEW._legendElement).html(generateChartLegend(VIEW._chartInstance));
    updateChartDownloadButton(chartInfo.selectionsTable);
};

/**
 * @param {String} contrast
 * @param {Object} chartInfo
 * @return null
 */
function updateGraphAnnotationColors(contrast, chartInfo) {
    if (chartInfo.options.annotation) {
        chartInfo.options.annotation.annotations.forEach(function (annotation) {
            if (contrast === 'default') {
                $.extend(true, annotation, annotation.defaultContrast);
            }
            else if (contrast === 'high') {
                $.extend(true, annotation, annotation.highContrast);
            }
        });
    }
}

/**
 * @param {Object} chart
 * @return {String} The HTML of the chart legend
 */
function generateChartLegend(chart) {
    var text = [];
    text.push('<h5 class="sr-only">' + translations.indicator.plot_legend_description + '</h5>');
    text.push('<ul id="legend" class="legend-for-' + chart.config.type + '-chart">');
    _.each(chart.data.datasets, function (dataset) {
        text.push('<li>');
        //text.push('<span class="swatch' + (dataset.borderDash ? ' dashed' : '') + (dataset.headline ? ' headline' : '') + '" style="background-color: ' + dataset.borderColor + '">');
        text.push('<span class="swatch' + (dataset.borderDash ? ' dashed' : '') + '" style="background-color: ' + dataset.borderColor + '">');
        text.push('<span class="swatch-inner" style="background-color: ' + dataset.borderColor + '"></span>');
        text.push('</span>');
        text.push(translations.t(dataset.label));
        text.push('</li>');
    });
    text.push('</ul>');
    return text.join('');
}

/**
 * @param {Object} chartConfig
 */
function refreshChartLineWrapping(chartConfig) {
    var yAxisLimit = 40,
        wrappedYAxis = strToArray(chartConfig.options.scales.y.title.text, yAxisLimit);
    chartConfig.options.scales.y.title.text = wrappedYAxis;
}

/**
 * @param {String} str
 * @param {Number} limit
 * @returns {Array} The string divided into an array for line wrapping.
 */
function strToArray (str, limit) {
    var words = str.split(' '),
        aux = [],
        concat = [];

    for (var i = 0; i < words.length; i++) {
        concat.push(words[i]);
        var join = concat.join(' ');
        if (join.length > limit) {
            aux.push(join);
            concat = [];
        }
    }

    if (concat.length) {
        aux.push(concat.join(' ').trim());
    }

    return aux;
}

  opensdg.annotationPresets = {
    common: {
        // This "common" preset is applied to all annotations automatically.
        borderColor: '#949494',
        //drawTime: 'afterDraw',
        type: 'line',
        borderDash: [10, 5],
        borderWidth: 1,
        label: {
            backgroundColor: 'rgba(255,255,255,0.6)',
            color: 'black',
        },
        // This "highContrast" overrides colors when in high-contrast mode.
        highContrast: {
            label: {
                backgroundColor: 'black',
                color: 'white',
            },
        },
        // This callback is used to generate a generic description for screenreaders.
        // This can be overridden to be a more specific string, eg:
        //
        //     description: 'Chart annotation showing a 2030 target of 15%'
        //
        description: function() {
            var descriptionParts = [translations.indicator.chart_annotation];
            if (this.label && this.label.content) {
                descriptionParts.push(translations.t(this.label.content) + ': ' + this.value);
            }
            else {
                // If there is no label, just specify whether it is a box or line.
                if (this.type == 'line') {
                    descriptionParts.push(this.mode + ' line');
                }
                if (this.type == 'box') {
                    descriptionParts.push('box');
                }
            }
            if (typeof this.value !== 'undefined') {
                descriptionParts.push(this.value);
            }
            return descriptionParts.join(': ');
        },
    },
    target_line: {
        mode: 'horizontal',
        borderWidth: 2,
        borderDash: [15, 10],
        borderColor: '#757575',
        label: {
            position: 'end',
            content: translations.indicator.annotation_2030_target,
        },
    },
    series_break: {
        mode: 'vertical',
        borderDash: [2, 2],
        label: {
            position: 'top',
            content: translations.indicator.annotation_series_break,
        },
    },
    error_bar: {
        adjustScaleRange: true,
        drawTime: 'afterDatasetsDraw',
        type: 'line',
        backgroundColor: '#383838',
        borderColor: '#383838',
        xScaleID: 'x',
        yScaleID: 'y',
        xMin: 2,
        xMax: 2,
        yMin: 15000,
        yMax: 25000,
    },
};

opensdg.chartTypes = opensdg.chartTypes || {};
opensdg.chartTypes.base = function(info) {

    var gridColor = getGridColor();
    var tickColor = getTickColor();

    var config = {
        type: null,
        data: {
            datasets: info.datasets,
            labels: info.labels,
        },
        options: {
            layout: {
              padding: {
                top: 5
              }
            },
            clip: false,
            responsive: true,
            maintainAspectRatio: false,
            spanGaps: true,
            scrollX: true,
            scrollCollapse: true,
            sScrollXInner: '150%',
            scales: {
                x: {
                    grid: {
                        color: function(line) {
                            return (line.index === 0) ? tickColor : 'transparent';
                        },
                    },
                    ticks: {
                        color: tickColor,
                    },
                    title: {
                        display: MODEL.xAxisLabel ? true : false,
                        text: MODEL.xAxisLabel,
                        color: tickColor,
                        font: {
                            size: 14,
                            family: "'Open Sans', Helvetica, Arial, sans-serif",
                        },
                    },
                },
                y: {
                    grid: {
                        color: function(line) {
                            return (line.index === 0) ? tickColor : gridColor;
                        },
                        drawBorder: false,
                    },
                    suggestedMin: 0,
                    ticks: {
                        color: tickColor,
                         callback: function (value) {
                             return alterDataDisplay(value, undefined, 'chart y-axis tick');
                         },
                    },
                    title: {
                        display: MODEL.selectedUnit ? translations.t(MODEL.selectedUnit) : MODEL.measurementUnit,
                        text: MODEL.selectedUnit ? translations.t(MODEL.selectedUnit) : MODEL.measurementUnit,
                        color: tickColor,
                        font: {
                            size: 14,
                            family: "'Open Sans', Helvetica, Arial, sans-serif",
                        },
                    }
                }
            },
            plugins: {
                scaler: {},
                title: {
                    display: false
                },
                legend: {
                    display: false,
                },
                tooltip: {
                    usePointStyle: true,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    callbacks: {
                        label: function (tooltipItem) {

                          var label =  translations.t(tooltipItem.dataset.label);
                          label = label.replace('<sub>','').replace('</sub>','');
                          if (label.length > 45){

                            label = label.split(' ');
                            var line = '';

                            for(var i=0; i<label.length; i++){
                              if (line.concat(label[i]).length < 45){
                                line = line.concat(label[i] + ' ');
                              }
                              else {
                                break
                              }
                            }
                            return line;
                          } else {
                            return label + ': ' + alterDataDisplay(tooltipItem.raw, tooltipItem.dataset, 'chart tooltip');
                          }
                        },
                        afterLabel: function(tooltipItem) {

                          var label =  tooltipItem.dataset.label;
                          label = label.replace('<sub>','').replace('</sub>','');
                          if (label.length > 45){
                            label = label.split(' ');
                            var re = [];
                            var line = '';
                            for (var i=0; i<label.length; i++){
                              if (line.concat(label[i]).length < 45){
                                line = line.concat(label[i] + ' ');
                              } else {
                                re.push(line);
                                line = '';
                                line = line.concat(label[i] + ' ');
                              }
                            };
                            re.push(line.slice(0, -1) + ': ' + alterDataDisplay(tooltipItem.raw, tooltipItem.dataset, 'chart tooltip'));
                            re.shift();
                          }
                          return re;
                        },
                        afterBody: function () {
                            var unit = MODEL.selectedUnit ? translations.t(MODEL.selectedUnit) : MODEL.measurementUnit;
                            if (typeof unit !== 'undefined' && unit !== '') {
                                return '\n' + translations.indicator.unit + ': ' + unit;
                            }
                        },
                    },
                },
            },
        }
    };

    if (info.graphLimits && Object.keys(info.graphLimits).length > 0) {
        var overrides = {
            options: {
                scales: {
                    y: {
                        min: info.graphLimits.minimum,
                        max: info.graphLimits.maximum,
                    }
                }
            }
        }
        // Add these overrides onto the normal config.
        _.merge(config, overrides);
    }
    else {
        // Otherwise remove any min/max that may be there.
        try {
            delete config.options.scales.y.min;
            delete config.options.scales.y.max;
        }
        catch (e) { }
    }

    if (info.graphStepsize && Object.keys(info.graphStepsize).length > 0) {
      var overrides = {
        options: {
          scales: {
            y: {
              ticks: {
                stepSize: info.graphStepsize.step,
              }
            }
          }
        }
      }
      // Add these overrides onto the normal config.
      $.extend(true, config, overrides);
    }

    if (info.graphAnnotations && info.graphAnnotations.length > 0) {
        // Apply some helpers/fixes to the annotations.
        var annotations = info.graphAnnotations.map(function(annotationOverrides) {
            var annotation = {};
            // Apply the "common" preset.
            if (opensdg.annotationPresets.common) {
                $.extend(true, annotation, opensdg.annotationPresets.common);
            }
            // Apply any specified presets.
            if (annotationOverrides.preset) {
                var preset = annotationOverrides.preset;
                if (opensdg.annotationPresets[preset]) {
                    $.extend(true, annotation, opensdg.annotationPresets[preset]);
                }
            }
            // Now add any more annotation config.
            $.extend(true, annotation, annotationOverrides);
            // Default to horizontal lines.
            if (!annotation.mode && annotation.type === 'line' && annotation.preset !== 'error_bar') {
                annotation.mode = 'horizontal';
            }
            // Provide the obscure scaleID properties on user's behalf.
            if (!annotation.scaleID && annotation.type === 'line' && annotation.preset !== 'error_bar' && annotation.preset !== 'target_point' && annotation.preset !== 'target_label') {
                if (annotation.mode === 'horizontal') {
                    annotation.scaleID = 'y';
                }
                if (annotation.mode === 'vertical') {
                    annotation.scaleID = 'x';
                }
            }
            if (!annotation.xScaleID && (annotation.type === 'box' || annotation.type === 'point')) {
                annotation.xScaleID = 'x';
            }
            if (!annotation.yScaleID && (annotation.type === 'box' || annotation.type === 'point')) {
                annotation.yScaleID = 'y';
            }
            // Provide the "enabled" label property on the user's behalf.
            if (annotation.label && annotation.label.content) {
                annotation.label.enabled = true;
            }
            // Translate any label content.
            if (annotation.label && annotation.label.content) {
                annotation.label.content = translations.t(annotation.label.content);
            }
            // Save some original values for later used when contrast mode is switched.
            if (typeof annotation.defaultContrast === 'undefined') {
                annotation.defaultContrast = {};
                if (annotation.borderColor) {
                    annotation.defaultContrast.borderColor = annotation.borderColor;
                }
                if (annotation.backgroundColor) {
                    annotation.defaultContrast.backgroundColor = annotation.backgroundColor;
                }
                if (annotation.label) {
                    annotation.defaultContrast.label = {};
                    if (annotation.label.fontColor) {
                        annotation.defaultContrast.label.fontColor = annotation.label.fontColor;
                    }
                    if (annotation.label.backgroundColor) {
                        annotation.defaultContrast.label.backgroundColor = annotation.label.backgroundColor;
                    }
                }
            }
            return annotation;
        });
        if (annotations.length > 0) {
            var overrides = {
                options: {
                    plugins: {
                        annotation: {
                            drawTime: 'afterDatasetsDraw',
                            annotations: annotations
                        }
                    }
                }
            };
            // Add these overrides onto the normal config.
            _.merge(config, overrides);

            // Update the chart annotations element.
            var descriptions = annotations.map(function(annotation) {
                var description = '';
                if (annotation.description) {
                    if (typeof annotation.description === 'function') {
                        description = annotation.description.call(annotation);
                    }
                    else {
                        description = translations.t(annotation.description);
                    }
                }
                return description;
            }).filter(function(description) { return description != ''; });

            var currentDescription = $('#chart-annotations').text();
            var newDescription = descriptions.join('. ');
            if (currentDescription != newDescription) {
                $('#chart-annotations').text(newDescription);
            }
        }
    }
    else if (config.options && config.options.annotation) {
        delete config.options.annotation;
    }

    return config;
}

  opensdg.chartTypes.line = function(info) {
    var config = opensdg.chartTypes.base(info);
    var overrides = {
        type: 'line',
        options: {
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false,
                },
            },
        },
        plugins: [{
            beforeDatasetsDraw: function(chart) {
                if (chart.tooltip._active && chart.tooltip._active.length) {
                    var activePoint = chart.tooltip._active[0],
                        ctx = chart.ctx,
                        x = activePoint.element.x,
                        topY = chart.scales.y.top,
                        bottomY = chart.scales.y.bottom;

                    // draw line
                    ctx.save();
                    ctx.beginPath();
                    ctx.moveTo(x, topY);
                    ctx.lineTo(x, bottomY);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#757575';
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }],
    };


    if (info.graphStepsize && Object.keys(info.graphStepsize).length > 0) {
      overrides.options = {
          scales: {
            yAxes: [{
              ticks: {
                stepSize: info.graphStepsize.step,
              }
            }]
          }
      };
    }

    // Add these overrides onto the normal config, and return it.
    _.merge(config, overrides);
    return config;
}

  opensdg.chartTypes.bar = function (info) {
    var config = opensdg.chartTypes.base(info);
    var overrides = {
        type: 'bar',
    };
    if (info.stackedDisaggregation) {
        overrides.options = {
            scales: {
                x: { stacked: true },
                y: { stacked: true },
            }
        };
        // If we have stackedDisaggregation, we need to group datasets into stacks.
        config.data.datasets.forEach(function (dataset) {
            var disaggregation = $.extend({}, dataset.disaggregation);
            // We're going to "stringify" each combination of disaggregations in order
            // to place them in their own "stacks". To place "stacked" disaggregations
            // into the same stack, we set them as "samestack" before stringifying.
            // Note that the string "samestack" is completely arbitrary.
            if (typeof disaggregation[info.stackedDisaggregation] !== 'undefined') {
                disaggregation[info.stackedDisaggregation] = 'samestack';
            }
            // Use the disaggregation as a unique id for each stack.
            dataset.stack = JSON.stringify(disaggregation);
        });
    }

    if (info.graphStepsize && Object.keys(info.graphStepsize).length > 0) {
      overrides.options = {
          scales: {
            yAxes: [{
              ticks: {
                stepSize: info.graphStepsize.step,
              }
            }]
          }
      };
    }

    // Manually set the borderWidths to 0 to avoid a weird border effect on the bars.
    config.data.datasets.forEach(function(dataset) {
        dataset.borderWidth = 0;
    });
    // Add these overrides onto the normal config, and return it.
    _.merge(config, overrides);
    return config;
}

  opensdg.convertBinaryValue = function (value) {
    if (typeof value === 'string') {
        value = parseInt(value, 10);
    }
    if (value === 1) {
        return 'Yes';
    }
    else if (value === -1) {
        return 'No';
    }
    return '';
}

opensdg.chartTypes.binary = function (info) {
    var config = opensdg.chartTypes.base(info);
    var overrides = {
        // Force the "bar" type instead of the "binary" type which Chart.js
        // does not recognize.
        type: 'bar',
        // Assign some callbacks to convert 1/-1 to Yes/No.
        options: {
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function (tooltipItem) {
                            var label = tooltipItem.dataset.label || '';
                            label += ': ' + opensdg.convertBinaryValue(tooltipItem.formattedValue);
                            return label;
                        },
                    },
                },
            },
            scales: {
                y: {
                    // Set the min/max to -1/1 so that the bars will start from the
                    // middle and either go up (for 1) or down (for -1).
                    min: -1,
                    max: 1,
                    ticks: {
                        callback: opensdg.convertBinaryValue,
                    },
                },
            },
        }
    }

    // Tweak the data so that 0 is treated as -1. This is done so that the bar appears
    // to be pointed down.
    config.data.datasets = config.data.datasets.map(function(dataset) {
        dataset.data = dataset.data.map(function(value) {
            if (value === 0) {
                return -1;
            }
            return value;
        });
        return dataset;
    });

    // Manually set the borderWidths to 0 to avoid a weird border effect on the bars.
    config.data.datasets.forEach(function(dataset) {
        dataset.borderWidth = 0;
    });

    // Add these overrides onto the normal config.
    _.merge(config, overrides);
    return config;
};

  /**
 * @param {Object} config
 * @param {Object} info
 * @return null
 */
function alterTableConfig(config, info) {
    opensdg.tableConfigAlterations.forEach(function (callback) {
        callback(config, info);
    });
}

/**
 * @param {Object} tableData
 * @return {String}
 */
function toCsv(tableData) {
    var lines = [],
        headings = _.map(tableData.headings, function (heading) { return '"' + translations.t(heading) + '"'; });

    lines.push(headings.join(','));

    _.each(tableData.data, function (dataValues) {
        var line = [];

        _.each(headings, function (heading, index) {
            line.push(dataValues[index]);
        });

        lines.push(line.join(','));
    });

    return lines.join('\n');
}

/**
 * @param {Element} el
 * @param {Object} info
 * @return null
 */
function initialiseDataTable(el, info) {
    var nonYearColumns = [];
    for (var i = 1; i < info.table.headings.length; i++) {
        nonYearColumns.push(i);
    }
    var datatables_options = OPTIONS.datatables_options || {
        paging: false,
        bInfo: false,
        bAutoWidth: false,
        searching: false,
        responsive: false,
        order: [[0, 'asc']],
        columnDefs: [
            {
                targets: nonYearColumns,
                createdCell: function (td, cellData, rowData, row, col) {
                    $(td).text(alterDataDisplay(cellData, rowData, 'table cell'));
                },
            },
        ],
    }, table = $(el).find('table');

    datatables_options.aaSorting = [];

    alterTableConfig(datatables_options, info);
    table.DataTable(datatables_options);
    table.removeAttr('role');
    table.find('thead th').removeAttr('rowspan').removeAttr('colspan').removeAttr('aria-label');
    setDataTableWidth(table);
};

/**
 * @param {Object} chartInfo
 * @return null
 */
function createSelectionsTable(chartInfo) {
    createTable(chartInfo.selectionsTable, chartInfo.indicatorId, '#selectionsTable', chartInfo.isProxy);
    $('#tableSelectionDownload').empty();
    createTableTargetLines(chartInfo.graphAnnotations);
    createDownloadButton(chartInfo.selectionsTable, 'Table', chartInfo.indicatorId, '#tableSelectionDownload');
    createSourceButton(chartInfo.shortIndicatorId, '#tableSelectionDownload');
    createIndicatorDownloadButtons(chartInfo.indicatorDownloads, chartInfo.shortIndicatorId, '#tableSelectionDownload');
};

/**
 * @param {Array} graphAnnotations
 * @return null
 */
function createTableTargetLines(graphAnnotations) {
    // var targetLines = graphAnnotations.filter(function (a) { return a.preset === 'target_line'; });
    // var $targetLines = $('#tableTargetLines');
    // $targetLines.empty();
    // targetLines.forEach(function (targetLine) {
    //     var targetLineLabel = targetLine.label.content;
    //     if (!targetLineLabel) {
    //         targetLineLabel = opensdg.annotationPresets.target_line.label.content;
    //     }
    //     $targetLines.append('<dt>' + targetLineLabel + '</dt><dd>' + alterDataDisplay(targetLine.value, targetLine, 'target line') + '</dd>');
    // });
    // if (targetLines.length === 0) {
    //     $targetLines.hide();
    // }
    // else {
    //     $targetLines.show();
    // }
}

/**
 * @param {Object} table
 * @return bool
 */
function tableHasData(table) {
    for (var i = 0; i < table.data.length; i++) {
        if (table.data[i].length > 1) {
            return true;
        }
    }
    return false;
}

/**
 * @param {Object} table
 * @param {String} indicatorId
 * @param {Element} el
 * @return null
 */
function createTable(table, indicatorId, el, isProxy) {

    var table_class = OPTIONS.table_class || 'table table-hover';

    // clear:
    $(el).html('');

    if (table && tableHasData(table)) {
        var currentTable = $('<table />').attr({
            'class': table_class,
            'width': '100%'
        });
        var tableTitle = MODEL.chartTitle;
        if (isProxy) {
            tableTitle += ' ' + PROXY_PILL;
        }
        if (MODEL.chartSubtitle) {
          currentTable.append('<caption>' + tableTitle + '<br><small>' + MODEL.chartSubtitle + '</small></caption>');
        } else {
          currentTable.append('<caption>' + tableTitle + '<br><small>' + MODEL.measurementUnit + '</small></caption>');
        }
        var table_head = '<thead><tr>';

        var getHeading = function (heading, index) {
            var arrows = '<span class="sort"><i class="fa fa-sort"></i><i class="fa fa-sort-down"></i><i class="fa fa-sort-up"></i></span>';
            var button = '<span tabindex="0" role="button" aria-describedby="column-sort-info">' + translations.t(heading) + '</span>';
            return button + arrows;
        };

        table.headings.forEach(function (heading, index) {
            table_head += '<th' + (!index ? '' : ' class="table-value"') + ' scope="col">' + getHeading(heading, index) + '</th>';
        });

        table_head += '</tr></thead>';
        currentTable.append(table_head);
        currentTable.append('<tbody></tbody>');

        table.data.forEach(function (data) {
            var row_html = '<tr>';
            table.headings.forEach(function (heading, index) {
                // For accessibility set the Year column to a "row" scope th.
                var isYear = (index == 0);
                var cell_prefix = (isYear) ? '<th scope="row"' : '<td';
                var cell_suffix = (isYear) ? '</th>' : '</td>';
                //var cell_content = (isYear) ? translations.t(data[index]) : data[index];
                //row_html += cell_prefix + (isYear ? '' : ' class="table-value"') + '>' + (cell_content !== null &&  cell_content !== undefined ?  cell_content : '.') + cell_suffix;
                row_html += cell_prefix + (isYear ? '' : ' class="table-value"') + '>' + (data[index] !== null &&  data[index] !== undefined ?  data[index] : '.') + cell_suffix;
            });
            row_html += '</tr>';
            currentTable.find('tbody').append(row_html);
        });

        $(el).append(currentTable);

        // initialise data table and provide some info for alterations.
        var alterationInfo = {
            table: table,
            indicatorId: indicatorId,
        };
        initialiseDataTable(el, alterationInfo);

        $(el).removeClass('table-has-no-data');
        $('#selectionTableFooter').show();

        $(el).find('th')
            .removeAttr('tabindex')
            .click(function () {
                var sortDirection = $(this).attr('aria-sort');
                $(this).find('span[role="button"]').attr('aria-sort', sortDirection);
            });
    } else {
        $(el).append($('<h3 />').text(translations.indicator.data_not_available));
        $(el).addClass('table-has-no-data');
        $('#selectionTableFooter').hide();
    }
}

/**
 * @param {Object} table
 * @return null
 */
function setDataTableWidth(table) {

    table.find('thead th').each(function () {
        var textLength = $(this).text().length;
        for (var loop = 0; loop < VIEW._tableColumnDefs.length; loop++) {
            var def = VIEW._tableColumnDefs[loop];
            if (textLength < def.maxCharCount) {
                if (!def.width) {
                    $(this).css('white-space', 'nowrap');
                } else {
                    $(this).css('width', def.width + 'px');
                    $(this).data('width', def.width);
                }
                break;
            }
        }
    });

    table.removeAttr('style width');
    table.css('width', '100%');
    // var totalWidth = 0;
    // var column = 0;
    // table.find('thead th').each(function () {
    //     column += 1;
    //     if ($(this).data('width')) {
    //         totalWidth += $(this).data('width');
    //         console.log('a) Column ', column, ': ',  $(this).data('width'), ', Total: ' + totalWidth);
    //     } else {
    //         totalWidth += $(this).width();
    //         console.log('b) Column ', column + ': ',  $(this).width(), ', Total: ' + totalWidth);
    //     }
    // });

    // ascertain whether the table should be width 100% or explicit width:
    // var containerWidth = table.closest('.dataTables_wrapper').width();
    // console.log('Table: ', totalWidth, 'Container: ', containerWidth);
    // if (totalWidth > containerWidth) {
    //     table.css('width', totalWidth + 'px');
    // } else {
    //     table.css('width', '100%');
    // }
}

/**
 * @param {Object} table
 * @return null
 */
function updateChartDownloadButton(table) {
    if (typeof VIEW._chartDownloadButton !== 'undefined') {
        var tableCsv = toCsv(table);
        var blob = new Blob([tableCsv], {
            type: 'text/csv'
        });
        var fileName = VIEW._chartDownloadButton.attr('download');
        if (window.navigator && window.navigator.msSaveBlob) {
            // Special behavior for IE.
            VIEW._chartDownloadButton.off('click.openSdgDownload')
            VIEW._chartDownloadButton.on('click.openSdgDownload', function (event) {
                window.navigator.msSaveBlob(blob, fileName);
            });
        }
        else {
            VIEW._chartDownloadButton
                .attr('href', URL.createObjectURL(blob))
                .data('csvdata', tableCsv);
        }
    }
}

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
    // In case the decimal separator has already been applied,
    // change it back now.
    if (typeof altered === 'string' && OPTIONS.decimalSeparator) {
        altered = altered.replace(OPTIONS.decimalSeparator, '.');
    }
    if (typeof altered !== 'number') {
        altered = Number(altered);
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
    if (OPTIONS.thousandsSeparator && precision <=3){
        altered = altered.toString().replace(/\B(?=(\d{3})+(?!\d))/g, OPTIONS.thousandsSeparator);
    }

    return altered;
}

  /**
 * @param {String} selectedSeries
 * @param {String} selectedUnit
 * @return null
 */
function updateSeriesAndUnitElements(selectedSeries, selectedUnit) {
    var hasSeries = typeof selectedSeries !== 'undefined',
        hasUnit = typeof selectedUnit !== 'undefined',
        hasBoth = hasSeries && hasUnit;
    if (hasSeries || hasUnit || hasBoth) {
        $('[data-for-series], [data-for-unit]').each(function () {
            var elementSeries = $(this).data('for-series'),
                elementUnit = $(this).data('for-unit'),
                seriesMatches = elementSeries === selectedSeries,
                unitMatches = elementUnit === selectedUnit;
            if ((hasSeries || hasBoth) && !seriesMatches && elementSeries !== '') {
                $(this).hide();
            }
            else if ((hasUnit || hasBoth) && !unitMatches && elementUnit !== '') {
                $(this).hide();
            }
            else {
                $(this).show();
            }
        });
    }
}

/**
 * @param {String} contrast
 * @return bool
 */
function isHighContrast(contrast) {
    if (contrast) {
        return contrast === 'high';
    }
    else {
        return $('body').hasClass('contrast-high');
    }
}

/**
 * @param {Object} table
 * @param {String} name
 * @param {String} indicatorId
 * @param {Element} el
 * @return null
 */
function createDownloadButton(table, name, indicatorId, el) {
    if (window.Modernizr.blobconstructor) {
        var downloadKey = 'download_csv';
        if (name == 'Chart') {
            downloadKey = 'download_chart';
        }
        if (name == 'Table') {
            downloadKey = 'download_table';
        }
        var gaLabel = 'Download ' + name + ' CSV: ' + indicatorId.replace('indicator_', '');
        var tableCsv = toCsv(table);
        var fileName = indicatorId + '.csv';
        var downloadButton = $('<a />').text(translations.indicator[downloadKey])
            .attr(opensdg.autotrack('download_data_current', 'Downloads', 'Download CSV', gaLabel))
            .attr({
                'download': fileName,
                'title': translations.indicator.download_csv_title,
                'aria-label': translations.indicator.download_csv_title,
                'class': 'btn btn-primary btn-download',
                'tabindex': 0
            });
        var blob = new Blob([tableCsv], {
            type: 'text/csv'
        });
        if (window.navigator && window.navigator.msSaveBlob) {
            // Special behavior for IE.
            downloadButton.on('click.openSdgDownload', function (event) {
                window.navigator.msSaveBlob(blob, fileName);
            });
        }
        else {
            downloadButton
                .attr('href', URL.createObjectURL(blob))
                .data('csvdata', tableCsv);
        }
        if (name == 'Chart') {
            VIEW._chartDownloadButton = downloadButton;
        }
        $(el).append(downloadButton);
    } else {
        var headlineId = indicatorId.replace('indicator', 'headline');
        var id = indicatorId.replace('indicator_', '');
        var gaLabel = 'Download Headline CSV: ' + id;
        $(el).append($('<a />').text(translations.indicator.download_headline)
            .attr(opensdg.autotrack('download_data_headline', 'Downloads', 'Download CSV', gaLabel))
            .attr({
                'href': opensdg.remoteDataBaseUrl + '/headline/' + id + '.csv',
                'download': headlineId + '.csv',
                'title': translations.indicator.download_headline_title,
                'aria-label': translations.indicator.download_headline_title,
                'class': 'btn btn-primary btn-download',
                'tabindex': 0
            }));
    }
}

/**
 * @param {String} indicatorId
 * @param {Element} el
 * @return null
 */
function createSourceButton(indicatorId, el) {
    var gaLabel = 'Download Source CSV: ' + indicatorId;
    $(el).append($('<a />').text(translations.indicator.download_source)
        .attr(opensdg.autotrack('download_data_source', 'Downloads', 'Download CSV', gaLabel))
        .attr({
            'href': opensdg.remoteDataBaseUrl + '/data/' + indicatorId + '.csv',
            'download': indicatorId + '.csv',
            'title': translations.indicator.download_source_title,
            'aria-label': translations.indicator.download_source_title,
            'class': 'btn btn-primary btn-download',
            'tabindex': 0
        }));
}

/**
 * @param {Object} indicatorDownloads
 * @param {String} indicatorId
 * @param {Element} el
 * @return null
 */
function createIndicatorDownloadButtons(indicatorDownloads, indicatorId, el) {
    if (indicatorDownloads) {
        var buttonLabels = Object.keys(indicatorDownloads);
        for (var i = 0; i < buttonLabels.length; i++) {
            var buttonLabel = buttonLabels[i];
            var href = indicatorDownloads[buttonLabel].href;
            var buttonLabelTranslated = translations.t(buttonLabel);
            var gaLabel = buttonLabel + ': ' + indicatorId;
            $(el).append($('<a />').text(buttonLabelTranslated)
                .attr(opensdg.autotrack(buttonLabel, 'Downloads', buttonLabel, gaLabel))
                .attr({
                    'href': opensdg.remoteDataBaseUrl + '/' + href,
                    'download': href.split('/').pop(),
                    'title': buttonLabelTranslated,
                    'class': 'btn btn-primary btn-download',
                    'tabindex': 0
                }));
        }
    }
}


  return {
    HIDE_SINGLE_SERIES: HIDE_SINGLE_SERIES,
    HIDE_SINGLE_UNIT: HIDE_SINGLE_UNIT,
    PROXY_PILL: PROXY_PILL,
    initialiseFields: initialiseFields,
    initialiseUnits: initialiseUnits,
    initialiseSerieses: initialiseSerieses,
    alterChartConfig: alterChartConfig,
    alterTableConfig: alterTableConfig,
    alterDataDisplay: alterDataDisplay,
    updateChartTitle: updateChartTitle,
    updateChartSubtitle: updateChartSubtitle,
    updateWithSelectedFields: updateWithSelectedFields,
    updateSeriesAndUnitElements: updateSeriesAndUnitElements,
    updateUnitElements: updateUnitElements,
    updateTimeSeriesAttributes: updateTimeSeriesAttributes,
    updatePlot: updatePlot,
    isHighContrast: isHighContrast,
    getHeadlineColor: getHeadlineColor,
    getGridColor: getGridColor,
    getTickColor: getTickColor,
    updateHeadlineColor: updateHeadlineColor,
    createPlot: createPlot,
    setPlotEvents: setPlotEvents,
    toCsv: toCsv,
    createIndicatorDownloadButtons: createIndicatorDownloadButtons,
    createSourceButton: createSourceButton,
    createDownloadButton: createDownloadButton,
    createSelectionsTable: createSelectionsTable,
    sortFieldGroup: sortFieldGroup,
  }
})();

    VIEW.helpers = helpers;

    VIEW._chartInstance = undefined;
    VIEW._tableColumnDefs = OPTIONS.tableColumnDefs;
    VIEW._mapView = undefined;
    VIEW._legendElement = OPTIONS.legendElement;
    VIEW._precision = undefined;
    VIEW._chartInstances = {};
    VIEW._graphStepsize = undefined;

    var chartHeight = screen.height < OPTIONS.maxChartHeight ? screen.height : OPTIONS.maxChartHeight;
    $('.plot-container', OPTIONS.rootElement).css('height', chartHeight + 'px');

    $(document).ready(function () {

        $(OPTIONS.rootElement).find('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
            if ($(e.target).attr('href') == '#tableview') {
                setDataTableWidth($(OPTIONS.rootElement).find('#selectionsTable table'));
            } else {
                $($.fn.dataTable.tables(true)).css('width', '100%');
                $($.fn.dataTable.tables(true)).DataTable().columns.adjust().draw();
            }
        });

        // Execute the hide/show functionality for the sidebar, both on
        // the currently active tab, and each time a tab is clicked on.
        $('.data-view .nav-item.active .nav-link').each(toggleSidebar);
        $('.data-view .nav-link').on('click', toggleSidebar);
        function toggleSidebar() {
            var $sidebar = $('.indicator-sidebar'),
                $main = $('.indicator-main'),
                hideSidebar = $(this).data('no-disagg'),
                mobile = window.matchMedia("screen and (max-width: 990px)");
            if (hideSidebar) {
                $sidebar.addClass('indicator-sidebar-hidden');
                $main.addClass('indicator-main-full');
                // On mobile, this can be confusing, so we need to scroll to the tabs.
                if (mobile.matches) {
                    $([document.documentElement, document.body]).animate({
                        scrollTop: $("#indicator-main").offset().top - 40
                    }, 400);
                }
            }
            else {
                $sidebar.removeClass('indicator-sidebar-hidden');
                $main.removeClass('indicator-main-full');
                // Make sure the unit/series items are updated, in case
                // they were changed while on the map.
                helpers.updateChartSubtitle(VIEW._dataCompleteArgs.chartSubtitle);
                helpers.updateChartTitle(VIEW._dataCompleteArgs.chartTitle, VIEW._dataCompleteArgs.isProxy);
                helpers.updateSeriesAndUnitElements(VIEW._dataCompleteArgs.selectedSeries, VIEW._dataCompleteArgs.selectedUnit);
                helpers.updateUnitElements(VIEW._dataCompleteArgs.selectedUnit);
                helpers.updateTimeSeriesAttributes(VIEW._dataCompleteArgs.timeSeriesAttributes);
            }
        };
    });

    MODEL.onDataComplete.attach(function (sender, args) {

        VIEW._precision = args.precision;
        VIEW._graphStepsize = args.graphStepsize;

        if (MODEL.showData) {
            $('#dataset-size-warning')[args.datasetCountExceedsMax ? 'show' : 'hide']();
            if (!VIEW._chartInstance) {
                helpers.createPlot(args);
                helpers.setPlotEvents(args);
            } else {
                helpers.updatePlot(args);
            }
        }

        helpers.createSelectionsTable(args);
        helpers.updateChartSubtitle(args.chartSubtitle);
        helpers.updateChartTitle(args.chartTitle, args.isProxy);
        helpers.updateSeriesAndUnitElements(args.selectedSeries, args.selectedUnit);
        helpers.updateUnitElements(args.selectedUnit);
        helpers.updateTimeSeriesAttributes(args.timeSeriesAttributes);

        VIEW._dataCompleteArgs = args;
    });

    MODEL.onFieldsComplete.attach(function (sender, args) {

        helpers.initialiseFields(args);

        if (args.hasGeoData && args.showMap) {
            VIEW._mapView = new mapView();
            VIEW._mapView.initialise(
                args.indicatorId,
                args.precision,
                args.precisionItems,
                OPTIONS.decimalSeparator,
                OPTIONS.thousandsSeparator,
                args.dataSchema,
                VIEW.helpers,
                MODEL.helpers,
                args.chartTitles,
                args.chartSubtitles,
                args.startValues,
                args.proxy,
                args.proxySerieses,
            );
        }
    });

    MODEL.onUnitsComplete.attach(function (sender, args) {

        helpers.initialiseUnits(args);
    });

    if (MODEL.onSeriesesComplete) {

        MODEL.onSeriesesComplete.attach(function (sender, args) {
            helpers.initialiseSerieses(args);
        });
    }

    MODEL.onFieldsCleared.attach(function (sender, args) {

        $(OPTIONS.rootElement).find(':checkbox').prop('checked', false);
        $(OPTIONS.rootElement).find('#clear')
            .addClass('disabled')
            .attr('aria-disabled', 'true')
            .attr('disabled', 'disabled');

        // reset available/unavailable fields
        helpers.updateWithSelectedFields();

        $(OPTIONS.rootElement).find('.selected').css('width', '0');
    });

    MODEL.onSelectionUpdate.attach(function (sender, args) {

        if (args.selectedFields.length) {
            $(OPTIONS.rootElement).find('#clear')
                .removeClass('disabled')
                .attr('aria-disabled', 'false')
                .removeAttr('disabled');
        }
        else {
            $(OPTIONS.rootElement).find('#clear')
                .addClass('disabled')
                .attr('aria-disabled', 'true')
                .attr('disabled', 'disabled');
        }

        // loop through the available fields:
        $('.variable-selector').each(function (index, element) {
            var currentField = $(element).data('field');
            var element = $(OPTIONS.rootElement).find('.variable-selector[data-field="' + currentField + '"]');

            // is this an allowed field:
            if (args.allowedFields.includes(currentField)) {
                $(element).removeClass('disallowed');
                $(element).find('> button').removeAttr('aria-describedby');
            }
            else {
                $(element).addClass('disallowed');
                $(element).find('> button').attr('aria-describedby', 'variable-hint-' + currentField);
            }
        });
    });

    MODEL.onFieldsStatusUpdated.attach(function (sender, args) {

        _.each(args.data, function (fieldGroup) {
            _.each(fieldGroup.values, function (fieldItem) {
                var element = $(OPTIONS.rootElement).find(':checkbox[value="' + fieldItem.value + '"][data-field="' + fieldGroup.field + '"]');
                element.parent().addClass(fieldItem.state).attr('data-has-data', fieldItem.hasData);
            });
            // Indicate whether the fieldGroup had any data.
            var fieldGroupElement = $(OPTIONS.rootElement).find('.variable-selector[data-field="' + fieldGroup.field + '"]');
            fieldGroupElement.attr('data-has-data', fieldGroup.hasData);
            var fieldGroupButton = fieldGroupElement.find('> button'),
                describedByCurrent = fieldGroupButton.attr('aria-describedby') || '',
                noDataHintId = 'no-data-hint-' + fieldGroup.field.replace(/ /g, '-');
            if (!fieldGroup.hasData && !describedByCurrent.includes(noDataHintId)) {
                fieldGroupButton.attr('aria-describedby', describedByCurrent + ' ' + noDataHintId);
            }
            else {
                fieldGroupButton.attr('aria-describedby', describedByCurrent.replace(noDataHintId, ''));
            }

            // Re-sort the items.
            helpers.sortFieldGroup(fieldGroupElement);
        });
    });

    $(OPTIONS.rootElement).on('click', '#clear', function () {
        MODEL.clearSelectedFields();
    });

    $(OPTIONS.rootElement).on('click', '#fields label', function (e) {

        if (!$(this).closest('.variable-selector').hasClass('disallowed')) {
            $(this).find(':checkbox').trigger('click');
        }

        e.preventDefault();
        e.stopPropagation();
    });

    $(OPTIONS.rootElement).on('change', '#units input', function () {
        MODEL.updateSelectedUnit($(this).val());
    });

    $(OPTIONS.rootElement).on('change', '#serieses input', function () {
        MODEL.updateSelectedSeries($(this).val());
    });

    $(OPTIONS.rootElement).on('click', '.variable-options button', function (e) {
        var type = $(this).data('type');
        var $options = $(this).closest('.variable-options').find(':checkbox');

        // The clear button can clear all checkboxes.
        if (type == 'clear') {
            $options.prop('checked', false);
        }
        // The select button must only select checkboxes that have data.
        if (type == 'select') {
            $options.parent().not('[data-has-data=false]').find(':checkbox').prop('checked', true)
        }

        helpers.updateWithSelectedFields();
        e.stopPropagation();
    });

    $(OPTIONS.rootElement).on('click', ':checkbox', function (e) {

        // don't permit disallowed selections:
        if ($(this).closest('.variable-selector').hasClass('disallowed')) {
            return;
        }

        helpers.updateWithSelectedFields();
        e.stopPropagation();
    });

    $(OPTIONS.rootElement).on('click', '.variable-selector', function (e) {

        var $button = $(e.target).closest('button');
        var $options = $(this).find('.variable-options');

        if ($options.is(':visible')) {
            $options.hide();
            $button.attr('aria-expanded', 'false');
        }
        else {
            $options.show();
            $button.attr('aria-expanded', 'true');
        }

        e.stopPropagation();
    });
};
var indicatorController = function (model, view) {
  this._model = model;
  this._view = view;
};

indicatorController.prototype = {
  initialise: function () {
    this._model.initialise();
  }
};
var indicatorInit = function () {
    if ($('#indicatorData').length) {
        var domData = $('#indicatorData').data();

        if (domData.showdata) {

            $('.async-loading').each(function (i, obj) {
                $(obj).append($('<img />').attr('src', $(obj).data('img')).attr('alt', translations.indicator.loading));
            });

            var remoteUrl = '/comb/' + domData.id + '.json';
            if (opensdg.remoteDataBaseUrl !== '/') {
                remoteUrl = opensdg.remoteDataBaseUrl + remoteUrl;
            }

            $.ajax({
                url: remoteUrl,
                success: function (res) {

                    $('.async-loading').remove();
                    $('.async-loaded').show();

                    var model = new indicatorModel({
                        data: res.data,
                        edgesData: res.edges,
                        showMap: domData.showmap,
                        country: domData.country,
                        indicatorId: domData.indicatorid,
                        shortIndicatorId: domData.id,
                        chartTitle: domData.charttitle,
                        chartTitles: domData.charttitles,
                        chartSubtitle: domData.chartsubtitle,
                        chartSubtitles: domData.chartsubtitles,
                        measurementUnit: domData.measurementunit,
                        xAxisLabel: domData.xaxislabel,
                        showData: domData.showdata,
                        showInfo: domData.showinfo,
                        graphType: domData.graphtype,
                        graphTypes: domData.graphtypes,
                        startValues: domData.startvalues,
                        graphLimits: domData.graphlimits,
                        stackedDisaggregation: domData.stackeddisaggregation,
                        showLine: domData.showline,
                        spanGaps: domData.spangaps,
                        graphAnnotations: domData.graphannotations,
                        graphTargetLines: domData.graphtargetlines,
                        graphSeriesBreaks: domData.graphseriesbreaks,
                        graphErrorBars: domData.grapherrorbars,
                        graphTargetPoints: domData.graphtargetpoints,
                        graphTargetLabels: domData.graphtargetlabels,
                        indicatorDownloads: domData.indicatordownloads,
                        dataSchema: domData.dataschema,
                        compositeBreakdownLabel: domData.compositebreakdownlabel,
                        precision: domData.precision,
                        graphStepsize: domData.graphstepsize,
                        proxy: domData.proxy,
                        proxySeries: domData.proxyseries,
                    });
                    var view = new indicatorView(model, {
                        rootElement: '#indicatorData',
                        legendElement: '#plotLegend',
                        decimalSeparator: ',',
                        thousandsSeparator: ' ',
                        maxChartHeight: 420,
                        tableColumnDefs: [
                            { maxCharCount: 25 }, // nowrap
                            //{ maxCharCount: 35, width: 200 },
                            { maxCharCount: Infinity, width: 300 }
                        ]
                    });
                    var controller = new indicatorController(model, view);
                    controller.initialise();
                }
            });
        }
    }
};
$(document).ready(function() {
    $('.nav-tabs').each(function() {
        var tabsList = $(this);

        // Allow clicking on the <li> to trigger tab click.
        tabsList.find('li').click(function(event) {
            if (event.target.tagName === 'LI') {
                $(event.target).find('> button').click();
            }
        });
    });
});
$(document).ready(function() {
    $('.nav-tabs').each(function() {
        var tabsList = $(this);
        var tabs = tabsList.find('li > button');
        var panes = tabsList.parent().find('.tab-pane');

        panes.attr({
            'role': 'tabpanel',
            'aria-hidden': 'true',
            'tabindex': '0',
        }).hide();

        tabsList.attr({
            'role': 'tablist',
        });

        tabs.each(function(idx) {
            var tab = $(this);
            var tabId = 'tab-' + tab.attr('data-bs-target').slice(1);
            var pane = tabsList.parent().find(tab.attr('data-bs-target'));

            tab.attr({
                'id': tabId,
                'role': 'tab',
                'aria-selected': 'false',
                'tabindex': '-1',
            }).parent().attr('role', 'presentation');

            pane.attr('aria-labelledby', tabId);

            tab.click(function(e) {
                e.preventDefault();

                tabsList.find('> li.active')
                    .removeClass('active')
                    .find('> button')
                    .attr({
                        'aria-selected': 'false',
                        'tabindex': '-1',
                    })
                    .removeClass('active');

                panes.filter(':visible').attr({
                    'aria-hidden': 'true',
                }).hide();

                pane.attr({
                    'aria-hidden': 'false',
                }).show();

                tab.attr({
                    'aria-selected': 'true',
                    'tabindex': '0',
                }).parent().addClass('active');
                tab.focus();
            });
        });

        // Show the first tabPanel
        panes.first().attr('aria-hidden', 'false').show();

        // Set state for the first tabsList li
        tabsList.find('li:first').addClass('active').find(' > button').attr({
            'aria-selected': 'true',
            'tabindex': '0',
        });

        // Set keydown events on tabList item for navigating tabs
        tabsList.delegate('button', 'keydown', function(e) {
            var tab = $(this);
            switch (e.which) {
                case 37:
                    if (tab.parent().prev().length != 0) {
                        tab.parent().prev().find('> button').click();
                        e.preventDefault();
                    }
                    else {
                        tabsList.find('li:last > button').click();
                        e.preventDefault();
                    }
                    break;
                case 39:
                    if (tab.parent().next().length != 0) {
                        tab.parent().next().find('> button').click();
                        e.preventDefault();
                    }
                    else {
                        tabsList.find('li:first > button').click();
                        e.preventDefault();
                    }
                    break;
            }
        });
    });
});
var indicatorSearch = function() {

  function sanitizeInput(input) {
    if (input === null) {
      return null;
    }
    var doc = new DOMParser().parseFromString(input, 'text/html');
    var stripped = doc.body.textContent || "";
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        "/": '&#x2F;',
        "`": '&grave;',
    };
    var reg = /[&<>"'/`]/ig;
    return stripped.replace(reg, function(match) {
      return map[match];
    });
  }

  var urlParams = new URLSearchParams(window.location.search);
  var searchTerms = sanitizeInput(urlParams.get('q'));
  if (searchTerms !== null) {
    document.getElementById('search-bar-on-page').value = searchTerms;
    document.getElementById('search-term').innerHTML = searchTerms;

    var searchTermsToUse = searchTerms;
    // This is to allow for searching by indicator with dashes.
    if (searchTerms.split('-').length == 3 && searchTerms.length < 15) {
      // Just a best-guess check to see if the user intended to search for an
      // indicator ID.
      searchTermsToUse = searchTerms.replace(/-/g, '.');
    }

    var useLunr = typeof window.lunr !== 'undefined';
    if (useLunr && opensdg.language != 'en') {
      if (typeof lunr[opensdg.language] === 'undefined') {
        useLunr = false;
      }
    }

    // Recognize an indicator id as a special case that does not need Lunr.
    var searchWords = searchTermsToUse.split(' '),
        indicatorIdParts = searchWords[0].split('.'),
        isIndicatorSearch = (searchWords.length === 1 && indicatorIdParts.length >= 3);
    if (isIndicatorSearch) {
      useLunr = false;
    }

    var results = [];
    var alternativeSearchTerms = [];
    var noTermsProvided = (searchTerms === '');

    if (useLunr && !noTermsProvided) {
      // Engish-specific tweak for words separated only by commas.
      if (opensdg.language == 'en') {
        lunr.tokenizer.separator = /[\s\-,]+/
      }

      var searchIndex = lunr(function () {
        if (opensdg.language != 'en' && lunr[opensdg.language]) {
          this.use(lunr[opensdg.language]);
        }
        this.use(storeUnstemmed);
        this.ref('url');
        // Index the expected fields.
        this.field('title', getSearchFieldOptions('title'));
        this.field('content', getSearchFieldOptions('content'));
        this.field('id', getSearchFieldOptions('id'));
        // Index any extra fields.
        var i;
        for (i = 0; i < opensdg.searchIndexExtraFields.length; i++) {
          var extraField = opensdg.searchIndexExtraFields[i];
          this.field(extraField, getSearchFieldOptions(extraField));
        }
        // Index all the documents.
        for (var ref in opensdg.searchItems) {
          this.add(opensdg.searchItems[ref]);
        };
      });

      // Perform the search.
      var results = searchIndex.search(searchTermsToUse);

      // If we didn't find anything, get progressively "fuzzier" to look for
      // alternative search term options.
      if (!results.length > 0) {
        for (var fuzziness = 1; fuzziness < 5; fuzziness++) {
          var fuzzierQuery = getFuzzierQuery(searchTermsToUse, fuzziness);
          var alternativeResults = searchIndex.search(fuzzierQuery);
          if (alternativeResults.length > 0) {
            var matchedTerms = getMatchedTerms(alternativeResults);
            if (matchedTerms) {
              alternativeSearchTerms = matchedTerms;
            }
            break;
          }
        }
      }
    }
    else if (!noTermsProvided) {
      // Non-Lunr basic search functionality.
      results = _.filter(opensdg.searchItems, function(item) {
        var i, match = false;
        if (item.title) {
          match = match || item.title.indexOf(searchTermsToUse) !== -1;
        }
        if (item.content) {
          match = match || item.content.indexOf(searchTermsToUse) !== -1;
        }
        for (i = 0; i < opensdg.searchIndexExtraFields.length; i++) {
          var extraField = opensdg.searchIndexExtraFields[i];
          if (typeof item[extraField] !== 'undefined') {
            match = match || item[extraField].indexOf(searchTermsToUse) !== -1;
          }
        }
        return match;
      });
      // Mimic what Lunr does.
      results = _.map(results, function(item) {
        return { ref: item.url }
      });
    }

    var resultItems = [];

    results.forEach(function(result) {
      var doc = opensdg.searchItems[result.ref]
      // Truncate the contents.
      if (doc.content.length > 400) {
        doc.content = doc.content.substring(0, 400) + '...';
      }
      // Indicate the matches.
      doc.content = doc.content.replace(new RegExp('(' + escapeRegExp(searchTerms) + ')', 'gi'), '<span class="match">$1</span>');
      doc.title = doc.title.replace(new RegExp('(' + escapeRegExp(searchTerms) + ')', 'gi'), '<span class="match">$1</span>');
      resultItems.push(doc);
    });

    $('.loader').hide();

    // Print the results using a template.
    var template = _.template(
      $("script.results-template").html()
    );
    $('div.results').html(template({
      searchResults: resultItems,
      resultsCount: resultItems.length,
      didYouMean: (alternativeSearchTerms.length > 0) ? alternativeSearchTerms : false,
    }));

    // Hide the normal header search.
    $('.header-search-bar').hide();
  }

  // Helper function to make a search query "fuzzier", using the ~ syntax.
  // See https://lunrjs.com/guides/searching.html#fuzzy-matches.
  function getFuzzierQuery(query, amountOfFuzziness) {
    return query
      .split(' ')
      .map(function(x) { return x + '~' + amountOfFuzziness; })
      .join(' ');
  }

  // Helper function to get the matched words from a result set.
  function getMatchedTerms(results) {
    var matchedTerms = {};
    results.forEach(function(result) {
      Object.keys(result.matchData.metadata).forEach(function(stemmedTerm) {
        Object.keys(result.matchData.metadata[stemmedTerm]).forEach(function(fieldName) {
          result.matchData.metadata[stemmedTerm][fieldName].unstemmed.forEach(function(unstemmedTerm) {
            matchedTerms[unstemmedTerm] = true;
          });
        });
      });
    });
    return Object.keys(matchedTerms);
  }

  // Helper function to get a boost score, if any.
  function getSearchFieldOptions(field) {
    var opts = {}
    var fieldBoost = opensdg.searchIndexBoost.find(function(boost) {
      return boost.field === field;
    });
    if (fieldBoost) {
      opts['boost'] = parseInt(fieldBoost.boost)
    }
    return opts
  }

  // Used to highlight search term matches on the screen.
  function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/gi, "\\$&");
  };

  // Define a pipeline function that keeps the unstemmed word.
  // See: https://github.com/olivernn/lunr.js/issues/287#issuecomment-454923675
  function storeUnstemmed(builder) {
    function pipelineFunction(token) {
      token.metadata['unstemmed'] = token.toString();
      return token;
    };
    lunr.Pipeline.registerFunction(pipelineFunction, 'storeUnstemmed');
    var firstPipelineFunction = builder.pipeline._stack[0];
    builder.pipeline.before(firstPipelineFunction, pipelineFunction);
    builder.metadataWhitelist.push('unstemmed');
  }
};

$(function() {

  var $el = $('#indicator_search');
  $('#jump-to-search').show();
  $('#jump-to-search a').click(function() {
    if($el.is(':hidden')) {
      $('.navbar span[data-target="search"]').click();
    }
    $el.focus();
  });

  indicatorSearch();
});

/*! @source http://purl.eligrey.com/github/classList.js/blob/master/classList.js */
"document"in self&&("classList"in document.createElement("_")&&(!document.createElementNS||"classList"in document.createElementNS("http://www.w3.org/2000/svg","g"))||!function(t){"use strict";if("Element"in t){var e="classList",n="prototype",i=t.Element[n],s=Object,r=String[n].trim||function(){return this.replace(/^\s+|\s+$/g,"")},o=Array[n].indexOf||function(t){for(var e=0,n=this.length;n>e;e++)if(e in this&&this[e]===t)return e;return-1},a=function(t,e){this.name=t,this.code=DOMException[t],this.message=e},c=function(t,e){if(""===e)throw new a("SYNTAX_ERR","An invalid or illegal string was specified");if(/\s/.test(e))throw new a("INVALID_CHARACTER_ERR","String contains an invalid character");return o.call(t,e)},l=function(t){for(var e=r.call(t.getAttribute("class")||""),n=e?e.split(/\s+/):[],i=0,s=n.length;s>i;i++)this.push(n[i]);this._updateClassName=function(){t.setAttribute("class",""+this)}},u=l[n]=[],h=function(){return new l(this)};if(a[n]=Error[n],u.item=function(t){return this[t]||null},u.contains=function(t){return t+="",-1!==c(this,t)},u.add=function(){var t,e=arguments,n=0,i=e.length,s=!1;do t=e[n]+"",-1===c(this,t)&&(this.push(t),s=!0);while(++n<i);s&&this._updateClassName()},u.remove=function(){var t,e,n=arguments,i=0,s=n.length,r=!1;do for(t=n[i]+"",e=c(this,t);-1!==e;)this.splice(e,1),r=!0,e=c(this,t);while(++i<s);r&&this._updateClassName()},u.toggle=function(t,e){t+="";var n=this.contains(t),i=n?e!==!0&&"remove":e!==!1&&"add";return i&&this[i](t),e===!0||e===!1?e:!n},u.toString=function(){return this.join(" ")},s.defineProperty){var f={get:h,enumerable:!0,configurable:!0};try{s.defineProperty(i,e,f)}catch(g){(void 0===g.number||-2146823252===g.number)&&(f.enumerable=!1,s.defineProperty(i,e,f))}}else s[n].__defineGetter__&&i.__defineGetter__(e,h)}}(self),function(){"use strict";var t=document.createElement("_");if(t.classList.add("c1","c2"),!t.classList.contains("c2")){var e=function(t){var e=DOMTokenList.prototype[t];DOMTokenList.prototype[t]=function(t){var n,i=arguments.length;for(n=0;i>n;n++)t=arguments[n],e.call(this,t)}};e("add"),e("remove")}if(t.classList.toggle("c3",!1),t.classList.contains("c3")){var n=DOMTokenList.prototype.toggle;DOMTokenList.prototype.toggle=function(t,e){return 1 in arguments&&!this.contains(t)==!e?e:n.call(this,t)}}t=null}());/*! modernizr 3.5.0 (Custom Build) | MIT *
 * https://modernizr.com/download/?-blobconstructor-localstorage-setclasses !*/
 !function(e,n,o){function s(e,n){return typeof e===n}function t(){var e,n,o,t,a,l,c;for(var f in i)if(i.hasOwnProperty(f)){if(e=[],n=i[f],n.name&&(e.push(n.name.toLowerCase()),n.options&&n.options.aliases&&n.options.aliases.length))for(o=0;o<n.options.aliases.length;o++)e.push(n.options.aliases[o].toLowerCase());for(t=s(n.fn,"function")?n.fn():n.fn,a=0;a<e.length;a++)l=e[a],c=l.split("."),1===c.length?Modernizr[c[0]]=t:(!Modernizr[c[0]]||Modernizr[c[0]]instanceof Boolean||(Modernizr[c[0]]=new Boolean(Modernizr[c[0]])),Modernizr[c[0]][c[1]]=t),r.push((t?"":"no-")+c.join("-"))}}function a(e){var n=c.className,o=Modernizr._config.classPrefix||"";if(f&&(n=n.baseVal),Modernizr._config.enableJSClass){var s=new RegExp("(^|\\s)"+o+"no-js(\\s|$)");n=n.replace(s,"$1"+o+"js$2")}Modernizr._config.enableClasses&&(n+=" "+o+e.join(" "+o),f?c.className.baseVal=n:c.className=n)}var r=[],i=[],l={_version:"3.5.0",_config:{classPrefix:"",enableClasses:!0,enableJSClass:!0,usePrefixes:!0},_q:[],on:function(e,n){var o=this;setTimeout(function(){n(o[e])},0)},addTest:function(e,n,o){i.push({name:e,fn:n,options:o})},addAsyncTest:function(e){i.push({name:null,fn:e})}},Modernizr=function(){};Modernizr.prototype=l,Modernizr=new Modernizr,Modernizr.addTest("blobconstructor",function(){try{return!!new Blob}catch(e){return!1}},{aliases:["blob-constructor"]}),Modernizr.addTest("localstorage",function(){var e="modernizr";try{return localStorage.setItem(e,e),localStorage.removeItem(e),!0}catch(n){return!1}});var c=n.documentElement,f="svg"===c.nodeName.toLowerCase();t(),a(r),delete l.addTest,delete l.addAsyncTest;for(var u=0;u<Modernizr._q.length;u++)Modernizr._q[u]();e.Modernizr=Modernizr}(window,document);/*
 * Leaflet selection legend.
 *
 * This is a Leaflet control designed to keep track of selected layers on a map
 * and visualize the selections as stacked bar graphs.
 */
(function () {
  "use strict";

  if (typeof L === 'undefined') {
    return;
  }

  L.Control.SelectionLegend = L.Control.extend({

    initialize: function(plugin) {
      this.selections = [];
      this.plugin = plugin;
    },

    addSelection: function(selection) {
      this.selections.push(selection);
      this.update();
    },

    removeSelection: function(selection) {
      var index = this.selections.indexOf(selection);
      this.selections.splice(index, 1);
      this.update();
    },

    isSelected: function(selection) {
      return (this.selections.indexOf(selection) !== -1);
    },

    onAdd: function() {
      var div = L.DomUtil.create('div', 'selection-legend');
      this.legendDiv = div;
      this.resetSwatches();
      return div;
    },

    renderSwatches: function() {
      var controlTpl = '' +
        '<dl id="selection-list"></dl>' +
        '<div class="legend-footer">' +
          '<div class="legend-swatches">' +
            '{legendSwatches}' +
          '</div>' +
          '<div class="legend-values">' +
            '<span class="legend-value left">{lowValue}</span>' +
            '<span class="arrow left"></span>' +
            '<span class="legend-value right">{highValue}</span>' +
            '<span class="arrow right"></span>' +
          '</div>' +
        '</div>';
      var swatchTpl = '<span class="legend-swatch" style="width:{width}%; background:{color};"></span>';
      var swatchWidth = 100 / this.plugin.options.colorRange.length;
      var swatches = this.plugin.options.colorRange.map(function(swatchColor) {
        return L.Util.template(swatchTpl, {
          width: swatchWidth,
          color: swatchColor,
        });
      }).join('');
      var context = { indicatorId: this.plugin.indicatorId };
      return L.Util.template(controlTpl, {
        lowValue: this.plugin.alterData(opensdg.dataRounding(this.plugin.valueRanges[this.plugin.currentDisaggregation][0], context)),
        highValue: this.plugin.alterData(opensdg.dataRounding(this.plugin.valueRanges[this.plugin.currentDisaggregation][1], context)),
        legendSwatches: swatches,
      });
    },

    resetSwatches: function() {
      this.legendDiv.innerHTML = this.renderSwatches();
    },

    update: function() {
      var selectionList = L.DomUtil.get('selection-list');
      var selectionTplHighValue = '' +
        '<dt class="selection-name"><span class="selection-name-background">{name}</span></dt>' +
        '<dd class="selection-value-item {valueStatus}">' +
          '<span class="selection-bar" style="background-color: {color}; width: {percentage}%;">' +
            '<span class="selection-value selection-value-high">' +
              '<span class="selection-value-high-background">{value}</span>' +
            '</span>' +
          '</span>' +
          '<i class="selection-close fa fa-remove"></i>' +
        '</dd>';
      var selectionTplLowValue = '' +
      '<dt class="selection-name"><span class="selection-name-background">{name}</span></dt>' +
      '<dd class="selection-value-item {valueStatus}">' +
        '<span class="selection-bar" style="background-color: {color}; width: {percentage}%;"></span>' +
        '<span class="selection-value selection-value-low" style="left: {percentage}%;">' +
          '<span class="selection-value-low-background">{value}</span>' +
        '</span>' +
        '<i class="selection-close fa fa-remove"></i>' +
      '</dd>';
      var plugin = this.plugin;
      var valueRange = this.plugin.valueRanges[this.plugin.currentDisaggregation];
      selectionList.innerHTML = this.selections.map(function(selection) {
        var value = plugin.getData(selection.feature.properties);
        var color = '#FFFFFF';
        var percentage, valueStatus;
        var templateToUse = selectionTplHighValue;
        if (typeof value === 'number') {
          color = plugin.colorScale(value).hex();
          valueStatus = 'has-value';
          var fraction = (value - valueRange[0]) / (valueRange[1] - valueRange[0]);
          percentage = Math.round(fraction * 100);
          if (percentage <= 50) {
            templateToUse = selectionTplLowValue;
          }
        }
        else {
          value = '';
          valueStatus = 'no-value';
          percentage = 0;
        }
        return L.Util.template(templateToUse, {
          name: selection.feature.properties.name,
          valueStatus: valueStatus,
          percentage: percentage,
          value: plugin.alterData(value),
          color: color,
        });
      }).join('');

      // Assign click behavior.
      var control = this,
          clickSelector = '#selection-list dd';
      $(clickSelector).click(function(e) {
        var index = $(clickSelector).index(this),
            selection = control.selections[index];
        control.removeSelection(selection);
        control.plugin.unhighlightFeature(selection);
      });
    }

  });

  // Factory function for this class.
  L.Control.selectionLegend = function(plugin) {
    return new L.Control.SelectionLegend(plugin);
  };
}());

/*
 * Leaflet year Slider.
 *
 * This is merely a specific configuration of Leaflet of L.TimeDimension.
 * See here: https://github.com/socib/Leaflet.TimeDimension
 */
(function () {
  "use strict";

  if (typeof L === 'undefined') {
    return;
  }

  var defaultOptions = {
    // YearSlider options.
    yearChangeCallback: null,
    years: [],
    // TimeDimensionControl options.
    timeSliderDragUpdate: true,
    speedSlider: false,
    position: 'bottomleft',
    playButton: false,
  };

  L.Control.YearSlider = L.Control.TimeDimension.extend({

    // Hijack the displayed date format.
    _getDisplayDateFormat: function(date){
      var time = date.toISOString().slice(0, 10);
      var match = this.options.years.find(function(y) { return y.time == time; });
      if (match) {
        return match.display;
      }
      else {
        return date.getFullYear();
      }
    },

    // Override the _createButton method to prevent the date from being a link.
    _createButton: function(title, container) {
      if (title === 'Date') {
        var span = L.DomUtil.create('span', this.options.styleNS + ' timecontrol-' + title.toLowerCase(), container);
        span.title = title;
        return span;
      }
      else {
        return L.Control.TimeDimension.prototype._createButton.call(this, title, container);
      }
    },

    // Override the _createSliderTime method to give the slider accessibility features.
    _createSliderTime: function(className, container) {
      var knob = L.Control.TimeDimension.prototype._createSliderTime.call(this, className, container),
          control = this,
          times = this._timeDimension.getAvailableTimes(),
          years = times.map(function(time) {
            var date = new Date(time);
            return control._getDisplayDateFormat(date);
          }),
          minYear = years[0],
          maxYear = years[years.length - 1],
          knobElement = knob._element;

      control._buttonBackward.title = translations.indicator.map_slider_back;
      control._buttonBackward.setAttribute('aria-label', control._buttonBackward.title);
      control._buttonForward.title = translations.indicator.map_slider_forward;
      control._buttonForward.setAttribute('aria-label', control._buttonForward.title);

      knobElement.setAttribute('tabindex', '0');
      knobElement.setAttribute('role', 'slider');
      knobElement.setAttribute('aria-label', translations.indicator.map_slider_keyboard);
      knobElement.title = translations.indicator.map_slider_mouse;
      knobElement.setAttribute('aria-valuemin', minYear);
      knobElement.setAttribute('aria-valuemax', maxYear);

      function updateSliderAttributes() {
        var yearIndex = 0;
        if (knob.getValue()) {
          yearIndex = knob.getValue();
        }
        knobElement.setAttribute('aria-valuenow', years[yearIndex]);
      }
      updateSliderAttributes();

      // Give the slider left/right keyboard functionality.
      knobElement.addEventListener('keydown', function(e) {
        if (e.which === 37 || e.which === 40) {
          var min = knob.getMinValue();
          var value = knob.getValue();
          value = value - 1;
          if (value >= min) {
            knob.setValue(value);
            control._sliderTimeValueChanged(value);
            updateSliderAttributes();
          }
          e.preventDefault();
        }
        else if (e.which === 39 || e.which === 38) {
          var max = knob.getMaxValue();
          var value = knob.getValue();
          value = value + 1;
          if (value <= max) {
            knob.setValue(value);
            control._sliderTimeValueChanged(value);
            updateSliderAttributes();
          }
          e.preventDefault();
        }
      });
      return knob;
    }

  });

  // Helper function to compose the full widget.
  L.Control.yearSlider = function(options) {
    var years = getYears(options.years);
    // Extend the defaults.
    options = L.Util.extend(defaultOptions, options);
    // Hardcode the timeDimension to year intervals.
    options.timeDimension = new L.TimeDimension({
      // We pad our years to at least January 2nd, so that timezone issues don't
      // cause any problems. This converts the array of years into a comma-
      // delimited string of YYYY-MM-DD dates.
      times: years.map(function(y) { return y.time }).join(','),
      //Set the map to the most recent year
      currentTime: new Date(years.slice(-1)[0].time).getTime(),
    });
    // Listen for time changes.
    if (typeof options.yearChangeCallback === 'function') {
      options.timeDimension.on('timeload', options.yearChangeCallback);
    };
    // Also pass in another callback for managing the back/forward buttons.
    options.timeDimension.on('timeload', function(e) {
      var currentTimeIndex = this.getCurrentTimeIndex(),
          availableTimes = this.getAvailableTimes(),
          $backwardButton = $('.timecontrol-backward'),
          $forwardButton = $('.timecontrol-forward'),
          isFirstTime = (currentTimeIndex === 0),
          isLastTime = (currentTimeIndex === availableTimes.length - 1);
      $backwardButton
        .attr('disabled', isFirstTime)
        .attr('aria-disabled', isFirstTime);
      $forwardButton
        .attr('disabled', isLastTime)
        .attr('aria-disabled', isLastTime);
    });
    // Pass in our years for later use.
    options.years = years;
    // Return the control.
    return new L.Control.YearSlider(options);
  };

  function isYear(year) {
    var parsedInt = parseInt(year, 10);
    return /^\d+$/.test(year) && parsedInt > 1900 && parsedInt < 3000;
  }

  function getYears(years) {
    // Support an array of years or an array of strings starting with years.
    var day = 2;
    return years.map(function(year) {
      var mapped = {
        display: year,
        time: year,
      };
      // Usually this is a year.
      if (isYear(year)) {
        mapped.time = year + '-01-02';
        // Start over that day variable.
        day = 2;
      }
      // Otherwise we get the year from the beginning of the string.
      else {
        var delimiters = ['-', '.', ' ', '/'];
        for (var i = 0; i < delimiters.length; i++) {
          var parts = year.split(delimiters[i]);
          if (parts.length > 1 && isYear(parts[0])) {
            mapped.time = parts[0] + '-01-0' + day;
            day += 1;
            break;
          }
        }
      }
      return mapped;
    });
  }
}());
/*
 * Leaflet fullscreenAccessible.
 *
 * This is an override of L.Control.Fullscreen for accessibility fixes.
 * See here: https://github.com/Leaflet/Leaflet.fullscreen
 */
(function () {
    "use strict";

    if (typeof L === 'undefined') {
        return;
    }

    L.Control.FullscreenAccessible = L.Control.Fullscreen.extend({
        onAdd: function(map) {
            var container = L.Control.Fullscreen.prototype.onAdd.call(this, map);
            this.link.setAttribute('role', 'button');
            this.link.setAttribute('aria-label', this.link.title);
            this.link.innerHTML = '<i class="fa fa-expand" aria-hidden="true"></i>';
            return container;
        },
        _toggleTitle: function() {
            L.Control.Fullscreen.prototype._toggleTitle.call(this);
            this.link.setAttribute('aria-label', this.link.title);
            var faClass = this._map.isFullscreen() ? 'fa-compress' : 'fa-expand'
            this.link.innerHTML = '<i class="fa ' + faClass + '" aria-hidden="true"></i>';
        }
    });

  }());
/*
 * Leaflet search.
 *
 * This is customized version of L.Control.Search.
 * See here: https://github.com/stefanocudini/leaflet-search
 */
(function () {
  "use strict";

  if (typeof L === 'undefined') {
    return;
  }

  L.Control.SearchAccessible = L.Control.Search.extend({
    onAdd: function(map) {
      var container = L.Control.Search.prototype.onAdd.call(this, map);

      this._input.setAttribute('aria-label', this._input.placeholder);
      this._input.removeAttribute('role');
      this._tooltip.setAttribute('aria-label', this._input.placeholder);

      this._button.setAttribute('role', 'button');
      this._accessibleCollapse();
      this._button.innerHTML = '<i class="fa fa-search" aria-hidden="true"></i>';

      this._cancel.setAttribute('role', 'button');
      this._cancel.title = translations.indicator.map_search_cancel;
      this._cancel.setAttribute('aria-label', this._cancel.title);
      this._cancel.innerHTML = '<i class="fa fa-close" aria-hidden="true"></i>';

      // Prevent the delayed collapse when tabbing out of the input box.
      L.DomEvent.on(this._cancel, 'focus', this.collapseDelayedStop, this);

      return container;
    },
    _createInput: function (text, className) {
      var input = L.Control.Search.prototype._createInput.call(this, text, className);
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-controls', 'map-search-listbox');
      var combobox = L.DomUtil.create('div', '', this._container);
      combobox.setAttribute('role', 'combobox');
      combobox.setAttribute('aria-expanded', 'false');
      combobox.setAttribute('aria-owns', 'map-search-listbox');
      combobox.setAttribute('aria-haspopup', 'listbox');
      combobox.id = 'map-search-combobox';
      combobox.append(input);
      this._combobox = combobox;
      return input;
    },
    _createTooltip: function(className) {
      var tooltip = L.Control.Search.prototype._createTooltip.call(this, className);
      tooltip.id = 'map-search-listbox';
      tooltip.setAttribute('role', 'listbox');
      return tooltip;
    },
    _accessibleExpand: function() {
      this._accessibleDescription(translations.indicator.map_search_hide);
      this._button.setAttribute('aria-expanded', 'true');
    },
    _accessibleCollapse: function() {
      this._accessibleDescription(translations.indicator.map_search_show);
      this._button.setAttribute('aria-expanded', 'false');
      this._button.focus();
    },
    _accessibleDescription: function(description) {
      this._button.title = description;
      this._button.setAttribute('aria-label', description);
    },
    expand: function(toggle) {
      L.Control.Search.prototype.expand.call(this, toggle);
      this._accessibleExpand();
      return this;
    },
    collapse: function() {
      L.Control.Search.prototype.collapse.call(this);
      this._accessibleCollapse();
      return this;
    },
    cancel: function() {
      L.Control.Search.prototype.cancel.call(this);
      this._accessibleExpand();
      this._combobox.setAttribute('aria-expanded', 'false');
      this._input.removeAttribute('aria-activedescendant');
      return this;
    },
    showTooltip: function(records) {
      L.Control.Search.prototype.showTooltip.call(this, records);
      this._accessibleDescription(translations.indicator.map_search);
      this._button.removeAttribute('aria-expanded');
      this._combobox.setAttribute('aria-expanded', 'true');
      if (this._countertips > 0) {
        this._input.setAttribute('aria-activedescendant', this._tooltip.childNodes[0].id);
      }
      return this._countertips;
    },
    _createTip: function(text, val) {
      var tip = L.Control.Search.prototype._createTip.call(this, text, val);
      tip.setAttribute('role', 'option');
      tip.id = 'map-search-option-' + val.layer.feature.properties.geocode;
      return tip;
    },
    _handleSubmit: function(e) {
      // Prevent the enter key from immediately collapsing the search bar.
      if ((typeof e === 'undefined' || e.type === 'keyup') && this._input.value === '') {
        return;
      }
      if (this._tooltip.childNodes.length > 0 && this._input.value !== '') {
        // This is a workaround for the bug where non-exact matches
        // do not successfully search. See this Github issue:
        // https://github.com/stefanocudini/leaflet-search/issues/264
        var firstSuggestion = this._tooltip.childNodes[0].innerText;
        var firstSuggestionLower = firstSuggestion.toLowerCase();
        var userInput = this._input.value;
        var userInputLower = userInput.toLowerCase();
        if (firstSuggestion !== userInput && firstSuggestionLower.includes(userInputLower)) {
          this._input.value = firstSuggestion;
        }
      }
      L.Control.Search.prototype._handleSubmit.call(this, e);
    },
    _handleArrowSelect: function(velocity) {
      L.Control.Search.prototype._handleArrowSelect.call(this, velocity);
      var searchTips = this._tooltip.hasChildNodes() ? this._tooltip.childNodes : [];
			for (i=0; i<searchTips.length; i++) {
			  searchTips[i].setAttribute('aria-selected', 'false');
      }
      var selectedTip = searchTips[this._tooltip.currentSelection];
      if (typeof selectedTip === 'undefined') {
        selectedTip = searchTips[0];
      }
      selectedTip.setAttribute('aria-selected', 'true');
      this._input.setAttribute('aria-activedescendant', selectedTip.id);
    },
    _createAlert: function(className) {
      var alert = L.Control.Search.prototype._createAlert.call(this, className);
      alert.setAttribute('role', 'alert');
      return alert;
    }
  });
}());
/*
 * Leaflet disaggregation controls.
 *
 * This is a Leaflet control designed replicate the disaggregation
 * controls that are in the sidebar for tables and charts.
 */
(function () {
    "use strict";

    if (typeof L === 'undefined') {
        return;
    }

    L.Control.DisaggregationControls = L.Control.extend({

        options: {
            position: 'bottomleft'
        },

        initialize: function (plugin) {
            this.plugin = plugin;
            this.list = null;
            this.form = null;
            this.currentDisaggregation = 0;
            this.displayedDisaggregation = 0;
            this.needsMapUpdate = false;
            this.seriesColumn = 'Series';
            this.unitsColumn = 'Units';
            this.displayForm = true;
            this.updateDisaggregations(plugin.startValues);
        },

        updateDisaggregations: function(startValues) {
            // TODO: Not all of this needs to be done
            // at every update.
            var features = this.getFeatures();
            if (startValues && startValues.length > 0) {
                this.currentDisaggregation = this.getStartingDisaggregation(features, startValues);
                this.displayedDisaggregation = this.currentDisaggregation;
                this.needsMapUpdate = true;
            }
            this.disaggregations = this.getVisibleDisaggregations(features);
            this.fieldsInOrder = this.getFieldsInOrder();
            this.valuesInOrder = this.getValuesInOrder();
            this.allSeries = this.getAllSeries();
            this.allUnits = this.getAllUnits();
            this.allDisaggregations = this.getAllDisaggregations();
            this.hasSeries = (this.allSeries.length > 0);
            this.hasUnits = (this.allUnits.length > 0);
            this.hasDisaggregations = this.hasDissagregationsWithValues();
            this.hasDisaggregationsWithMultipleValuesFlag = this.hasDisaggregationsWithMultipleValues();
        },

        getFeatures: function() {
            return this.plugin.getVisibleLayers().toGeoJSON().features.filter(function(feature) {
                return typeof feature.properties.disaggregations !== 'undefined';
            });
        },

        getStartingDisaggregation: function(features, startValues) {
            if (features.length === 0) {
                return;
            }
            var disaggregations = features[0].properties.disaggregations,
                fields = Object.keys(disaggregations[0]),
                weighted = _.sortBy(disaggregations.map(function(disaggregation, index) {
                    var disaggClone = Object.assign({}, disaggregation);
                    disaggClone.emptyFields = 0;
                    disaggClone.index = index;
                    fields.forEach(function(field) {
                        if (disaggClone[field] == '') {
                            disaggClone.emptyFields += 1;
                        }
                    });
                    return disaggClone;
                }), 'emptyFields').reverse(),
                match = weighted.find(function(disaggregation) {
                    return _.every(startValues, function(startValue) {
                        return disaggregation[startValue.field] === startValue.value;
                    });
                });
            if (match) {
                return match.index;
            }
            else {
                return 0;
            }
        },

        getVisibleDisaggregations: function(features) {
            if (features.length === 0) {
                return [];
            }

            var disaggregations = features[0].properties.disaggregations;
            // The purpose of the rest of this function is to identiy
            // and remove any "region columns" - ie, any columns that
            // correspond exactly to names of map regions. These columns
            // are useful on charts and tables but should not display
            // on maps.
            var allKeys = Object.keys(disaggregations[0]);
            var relevantKeys = {};
            var rememberedValues = {};
            disaggregations.forEach(function(disagg) {
                for (var i = 0; i < allKeys.length; i++) {
                    var key = allKeys[i];
                    if (rememberedValues[key]) {
                        if (rememberedValues[key] !== disagg[key]) {
                            relevantKeys[key] = true;
                        }
                    }
                    rememberedValues[key] = disagg[key];
                }
            });
            relevantKeys = Object.keys(relevantKeys);
            if (features.length > 1) {
                // Any columns not already identified as "relevant" might
                // be region columns.
                var regionColumnCandidates = allKeys.filter(function(item) {
                    return relevantKeys.includes(item) ? false : true;
                });
                // Compare the column value across map regions - if it is
                // different then we assume the column is a "region column".
                // For efficiency we only check the first and second region.
                var regionColumns = regionColumnCandidates.filter(function(candidate) {
                    var region1 = features[0].properties.disaggregations[0][candidate];
                    var region2 = features[1].properties.disaggregations[0][candidate];
                    return region1 === region2 ? false : true;
                });
                // Now we can treat any non-region columns as relevant.
                regionColumnCandidates.forEach(function(item) {
                    if (!regionColumns.includes(item)) {
                        relevantKeys.push(item);
                    }
                });
            }
            relevantKeys.push(this.seriesColumn);
            relevantKeys.push(this.unitsColumn);
            var pruned = [];
            disaggregations.forEach(function(disaggregation) {
                var clone = Object.assign({}, disaggregation);
                Object.keys(clone).forEach(function(key) {
                    if (!(relevantKeys.includes(key))) {
                        delete clone[key];
                    }
                });
                pruned.push(clone);
            });
            return pruned;
        },

        update: function() {
            this.updateDisaggregations();
            this.updateList();
            if (this.displayForm) {
                this.updateForm();
            }
        },

        getFieldsInOrder: function () {
            return this.plugin.dataSchema.fields.map(function(field) {
                return field.name;
            });
        },

        getValuesInOrder: function () {
            var valuesInOrder = {};
            this.plugin.dataSchema.fields.forEach(function(field) {
                if (field.constraints && field.constraints.enum) {
                    valuesInOrder[field.name] = field.constraints.enum;
                }
            });
            return valuesInOrder;
        },

        hasDissagregationsWithValues: function () {
            var hasDisaggregations = false;
            this.allDisaggregations.forEach(function(disaggregation) {
                if (disaggregation.values.length > 0 && disaggregation.values[0] !== '') {
                    hasDisaggregations = true;
                }
            });
            return hasDisaggregations;
        },

        hasDisaggregationsWithMultipleValues: function () {
            var hasDisaggregations = false;
            this.allDisaggregations.forEach(function(disaggregation) {
                if (disaggregation.values.length > 1 && disaggregation.values[1] !== '') {
                    hasDisaggregations = true;
                }
            });
            return hasDisaggregations;
        },

        updateList: function () {
            var list = this.list;
            list.innerHTML = '';
            if (this.hasSeries) {
                var title = L.DomUtil.create('dt', 'disaggregation-title'),
                    definition = L.DomUtil.create('dd', 'disaggregation-definition'),
                    container = L.DomUtil.create('div', 'disaggregation-container');
                title.innerHTML = translations.indicator.series;
                definition.innerHTML = this.getCurrentSeries();
                container.append(title);
                container.append(definition);
                list.append(container);
            }
            if (this.hasUnits) {
                var title = L.DomUtil.create('dt', 'disaggregation-title'),
                    definition = L.DomUtil.create('dd', 'disaggregation-definition'),
                    container = L.DomUtil.create('div', 'disaggregation-container');
                title.innerHTML = translations.indicator.unit;
                definition.innerHTML = this.getCurrentUnit();
                container.append(title);
                container.append(definition);
                list.append(container);
            }
            if (this.hasDisaggregations) {
                var currentDisaggregation = this.disaggregations[this.currentDisaggregation];
                this.allDisaggregations.forEach(function(disaggregation) {
                    var title = L.DomUtil.create('dt', 'disaggregation-title'),
                        definition = L.DomUtil.create('dd', 'disaggregation-definition'),
                        container = L.DomUtil.create('div', 'disaggregation-container'),
                        field = disaggregation.field;
                    title.innerHTML = translations.t(field);
                    var disaggregationValue = currentDisaggregation[field];
                    if (disaggregationValue !== '') {
                        definition.innerHTML = disaggregationValue;
                        container.append(title);
                        container.append(definition);
                        list.append(container);
                    }
                });
            }
        },

        updateForm: function() {
            var seriesColumn = this.seriesColumn,
                unitsColumn = this.unitsColumn,
                container = this.form,
                formInputs = L.DomUtil.create('div', 'disaggregation-form-inner'),
                that = this;
            container.innerHTML = '';
            container.append(formInputs)
            L.DomEvent.disableScrollPropagation(formInputs);
            if (this.hasSeries) {
                var form = L.DomUtil.create('div', 'disaggregation-fieldset-container'),
                    legend = L.DomUtil.create('legend', 'disaggregation-fieldset-legend'),
                    fieldset = L.DomUtil.create('fieldset', 'disaggregation-fieldset');
                legend.innerHTML = translations.indicator.series;
                fieldset.append(legend);
                form.append(fieldset);
                formInputs.append(form);
                this.allSeries.forEach(function(series) {
                    var input = L.DomUtil.create('input', 'disaggregation-input');
                    input.type = 'radio';
                    input.name = 'map-' + seriesColumn;
                    input.value = series;
                    input.tabindex = 0;
                    input.checked = (series === that.getCurrentSeries()) ? 'checked' : '';
                    var label = L.DomUtil.create('label', 'disaggregation-label');
                    label.innerHTML = series;
                    if (that.plugin.proxySerieses.includes(series)) {
                        label.innerHTML += ' ' + that.plugin.viewHelpers.PROXY_PILL;
                    }
                    label.prepend(input);
                    fieldset.append(label);
                    input.addEventListener('change', function(e) {
                        that.currentDisaggregation = that.getSelectedDisaggregationIndex(seriesColumn, series);
                        that.updateForm();
                    });
                });
            }
            if (this.hasUnits) {
                var form = L.DomUtil.create('div', 'disaggregation-fieldset-container'),
                    legend = L.DomUtil.create('legend', 'disaggregation-fieldset-legend'),
                    fieldset = L.DomUtil.create('fieldset', 'disaggregation-fieldset');
                legend.innerHTML = translations.indicator.unit_of_measurement;
                fieldset.append(legend);
                form.append(fieldset);
                formInputs.append(form);
                this.allUnits.forEach(function(unit) {
                    var input = L.DomUtil.create('input', 'disaggregation-input');
                    if (that.isDisaggegrationValidGivenCurrent(unitsColumn, unit)) {
                        input.type = 'radio';
                        input.name = 'map-' + unitsColumn;
                        input.value = unit;
                        input.tabindex = 0;
                        input.checked = (unit === that.getCurrentUnit()) ? 'checked' : '';
                        var label = L.DomUtil.create('label', 'disaggregation-label');
                        label.innerHTML = unit;
                        label.prepend(input);
                        fieldset.append(label);
                        input.addEventListener('change', function(e) {
                            that.currentDisaggregation = that.getSelectedDisaggregationIndex(unitsColumn, unit);
                            that.updateForm();
                        });
                    }
                });
            }
            if (this.hasDisaggregations) {
                var currentDisaggregation = this.disaggregations[this.currentDisaggregation];
                this.allDisaggregations.forEach(function (disaggregation) {
                    var form = L.DomUtil.create('div', 'disaggregation-fieldset-container'),
                        legend = L.DomUtil.create('legend', 'disaggregation-fieldset-legend'),
                        fieldset = L.DomUtil.create('fieldset', 'disaggregation-fieldset'),
                        field = disaggregation.field;
                    legend.innerHTML = translations.t(field);
                    fieldset.append(legend);
                    form.append(fieldset);
                    formInputs.append(form);
                    disaggregation.values.forEach(function (value) {
                        var input = L.DomUtil.create('input', 'disaggregation-input');
                        if (that.isDisaggegrationValidGivenCurrent(field, value)) {
                            input.type = 'radio';
                            input.name = 'map-' + field;
                            input.value = value;
                            input.tabindex = 0;
                            input.checked = (value === currentDisaggregation[field]) ? 'checked' : '';
                            var label = L.DomUtil.create('label', 'disaggregation-label');
                            label.innerHTML = (value === '') ? translations.indicator.total : value;
                            label.prepend(input);
                            fieldset.append(label);
                            input.addEventListener('change', function(e) {
                                that.currentDisaggregation = that.getSelectedDisaggregationIndex(field, value);
                                that.updateForm();
                            });
                        }
                    });
                });
            }

            var applyButton = L.DomUtil.create('button', 'disaggregation-apply-button'),
                cancelButton = L.DomUtil.create('button', 'disaggregation-cancel-button'),
                buttonContainer = L.DomUtil.create('div', 'disaggregation-form-buttons');
            applyButton.innerHTML = translations.indicator.apply;
            buttonContainer.append(applyButton);
            cancelButton.innerHTML = translations.indicator.cancel;
            buttonContainer.append(cancelButton);
            container.append(buttonContainer);

            cancelButton.addEventListener('click', function(e) {
                that.currentDisaggregation = that.displayedDisaggregation;
                $('.disaggregation-form-outer').toggle();
                that.updateForm();
            });
            applyButton.addEventListener('click', function(e) {
                that.updateMap();
                that.updateList();
                $('.disaggregation-form-outer').toggle();
            });
        },

        updateMap: function() {
            this.needsMapUpdate = false;
            this.plugin.currentDisaggregation = this.currentDisaggregation;
            this.plugin.updatePrecision();
            this.plugin.setColorScale();
            this.plugin.updateColors();
            this.plugin.updateTooltips();
            this.plugin.selectionLegend.resetSwatches();
            this.plugin.selectionLegend.update();
            this.plugin.updateTitle();
            this.plugin.updateFooterFields();
            this.plugin.replaceYearSlider();
        },

        onAdd: function () {
            var div = L.DomUtil.create('div', 'disaggregation-controls'),
                list = L.DomUtil.create('dl', 'disaggregation-list'),
                that = this;

            if (this.hasSeries || this.hasUnits || this.hasDisaggregations) {
                this.list = list;
                div.append(list);
                this.updateList();

                var numSeries = this.allSeries.length,
                    numUnits = this.allUnits.length,
                    displayForm = this.displayForm;

                if (displayForm && (this.hasDisaggregationsWithMultipleValuesFlag || (numSeries > 1 || numUnits > 1))) {

                    var button = L.DomUtil.create('button', 'disaggregation-button');
                    button.innerHTML = translations.indicator.change_breakdowns;
                    button.addEventListener('click', function(e) {
                        that.displayedDisaggregation = that.currentDisaggregation;
                        $('.disaggregation-form-outer').show();
                    });
                    div.append(button);

                    var container = L.DomUtil.create('div', 'disaggregation-form');
                    var containerOuter = L.DomUtil.create('div', 'disaggregation-form-outer');
                    containerOuter.append(container);
                    this.form = container;
                    div.append(containerOuter);
                    this.updateForm();
                }
            }

            return div;
        },

        getCurrentSeries: function() {
            var disaggregation = this.disaggregations[this.currentDisaggregation];
            return disaggregation[this.seriesColumn];
        },

        getCurrentUnit: function() {
            var disaggregation = this.disaggregations[this.currentDisaggregation];
            return disaggregation[this.unitsColumn];
        },

        getAllSeries: function () {
            var seriesColumn = this.seriesColumn;
            if (typeof this.disaggregations[0][seriesColumn] === 'undefined' || !this.disaggregations[0][seriesColumn]) {
                return [];
            }
            var allSeries = _.uniq(this.disaggregations.map(function(disaggregation) {
                return disaggregation[seriesColumn];
            }));
            var sortedSeries = this.valuesInOrder[seriesColumn];
            allSeries.sort(function(a, b) {
                return sortedSeries.indexOf(a) - sortedSeries.indexOf(b);
            });
            return allSeries;
        },

        getAllUnits: function () {
            var unitsColumn = this.unitsColumn;
            if (typeof this.disaggregations[0][unitsColumn] === 'undefined' || !this.disaggregations[0][unitsColumn]) {
                return [];
            }
            var allUnits = _.uniq(this.disaggregations.map(function(disaggregation) {
                return disaggregation[unitsColumn];
            }));
            var sortedUnits = this.valuesInOrder[unitsColumn];
            allUnits.sort(function(a, b) {
                return sortedUnits.indexOf(a) - sortedUnits.indexOf(b);
            });
            return allUnits;
        },

        getAllDisaggregations: function () {
            var disaggregations = this.disaggregations,
                valuesInOrder = this.valuesInOrder,
                validFields = Object.keys(disaggregations[0]),
                invalidFields = [this.seriesColumn, this.unitsColumn],
                allDisaggregations = [];

            this.fieldsInOrder.forEach(function(field) {
                if (!(invalidFields.includes(field)) && validFields.includes(field)) {
                    var sortedValues = valuesInOrder[field],
                        item = {
                            field: field,
                            values: _.uniq(disaggregations.map(function(disaggregation) {
                                return disaggregation[field];
                            })),
                        };
                    item.values.sort(function(a, b) {
                        return sortedValues.indexOf(a) - sortedValues.indexOf(b);
                    });
                    allDisaggregations.push(item);
                }
            });

            return allDisaggregations;
        },

        getSelectedDisaggregationIndex: function(changedKey, newValue) {
            for (var i = 0; i < this.disaggregations.length; i++) {
                var disaggregation = this.disaggregations[i],
                    keys = Object.keys(disaggregation),
                    matchesSelections = true;
                for (var j = 0; j < keys.length; j++) {
                    var key = keys[j],
                        inputName = 'map-' + key,
                        $inputElement = $('input[name="' + inputName + '"]:checked'),
                        selection = $inputElement.val();
                    if ($inputElement.length > 0 && selection !== disaggregation[key]) {
                        matchesSelections = false;
                        break;
                    }
                }
                if (matchesSelections) {
                    return i;
                }
            }
            // If we are still here, it means that a recent change
            // has resulted in an illegal combination. In this case
            // we look at the recently-changed key and its value,
            // and we pick the first disaggregation that matches.
            for (var i = 0; i < this.disaggregations.length; i++) {
                var disaggregation = this.disaggregations[i],
                    keys = Object.keys(disaggregation);
                if (keys.includes(changedKey) && disaggregation[changedKey] === newValue) {
                    return i;
                }
            }
            // If we are still here, something went wrong.
            throw('Could not find match');
        },

        isDisaggegrationValidGivenCurrent: function(field, value) {
            var currentDisaggregation = Object.assign({}, this.disaggregations[this.currentDisaggregation]);
            currentDisaggregation[field] = value;
            var keys = Object.keys(currentDisaggregation);
            for (var i = 0; i < this.disaggregations.length; i++) {
                var valid = true;
                var otherDisaggregation = this.disaggregations[i];
                for (var j = 0; j < keys.length; j++) {
                    var key = keys[j];
                    if (currentDisaggregation[key] !== otherDisaggregation[key]) {
                        valid = false;
                    }
                }
                if (valid) {
                    return true;
                }
            }
            return false;
        },

    });

    // Factory function for this class.
    L.Control.disaggregationControls = function (plugin) {
        return new L.Control.DisaggregationControls(plugin);
    };
}());
$(document).ready(function() {
    $('a[href="#top"]').prepend('<svg class="app-c-back-to-top__icon" xmlns="http://www.w3.org/2000/svg" width="13" height="17" viewBox="0 0 13 17" aria-hidden="true" focusable="false"><path fill="currentColor" d="M6.5 0L0 6.5 1.4 8l4-4v12.7h2V4l4.3 4L13 6.4z"></path></svg>');
});
function confirm_alert(source, lang) {
  if (source && source != '') {
    if (lang == 'De'){
      var text = 'Sie verlassen unsere Webseite!\nDer Link führt Sie zur Webseite '
    } else{
      var text = 'You are leaving our website!\nThe link leads to the website of '
    }
    return confirm(text + source + '.');
  } else {
    if (lang == 'De'){
      var text = 'Sie verlassen unsere Webseite!\nDer Link führt Sie zu einer externen Webseite.'
    }else{
      var text = 'You are leaving our website!\nThe link leads to an external website.'
    }
    return confirm(text)
  }
}
/**
 * @license
 * Lodash <https://lodash.com/>
 * Copyright OpenJS Foundation and other contributors <https://openjsf.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */
(function(){function n(n,t,r){switch(r.length){case 0:return n.call(t);case 1:return n.call(t,r[0]);case 2:return n.call(t,r[0],r[1]);case 3:return n.call(t,r[0],r[1],r[2])}return n.apply(t,r)}function t(n,t,r,e){for(var u=-1,i=null==n?0:n.length;++u<i;){var o=n[u];t(e,o,r(o),n)}return e}function r(n,t){for(var r=-1,e=null==n?0:n.length;++r<e&&t(n[r],r,n)!==!1;);return n}function e(n,t){for(var r=null==n?0:n.length;r--&&t(n[r],r,n)!==!1;);return n}function u(n,t){for(var r=-1,e=null==n?0:n.length;++r<e;)if(!t(n[r],r,n))return!1;
return!0}function i(n,t){for(var r=-1,e=null==n?0:n.length,u=0,i=[];++r<e;){var o=n[r];t(o,r,n)&&(i[u++]=o)}return i}function o(n,t){return!!(null==n?0:n.length)&&y(n,t,0)>-1}function f(n,t,r){for(var e=-1,u=null==n?0:n.length;++e<u;)if(r(t,n[e]))return!0;return!1}function c(n,t){for(var r=-1,e=null==n?0:n.length,u=Array(e);++r<e;)u[r]=t(n[r],r,n);return u}function a(n,t){for(var r=-1,e=t.length,u=n.length;++r<e;)n[u+r]=t[r];return n}function l(n,t,r,e){var u=-1,i=null==n?0:n.length;for(e&&i&&(r=n[++u]);++u<i;)r=t(r,n[u],u,n);
return r}function s(n,t,r,e){var u=null==n?0:n.length;for(e&&u&&(r=n[--u]);u--;)r=t(r,n[u],u,n);return r}function h(n,t){for(var r=-1,e=null==n?0:n.length;++r<e;)if(t(n[r],r,n))return!0;return!1}function p(n){return n.split("")}function _(n){return n.match($t)||[]}function v(n,t,r){var e;return r(n,function(n,r,u){if(t(n,r,u))return e=r,!1}),e}function g(n,t,r,e){for(var u=n.length,i=r+(e?1:-1);e?i--:++i<u;)if(t(n[i],i,n))return i;return-1}function y(n,t,r){return t===t?Z(n,t,r):g(n,b,r)}function d(n,t,r,e){
for(var u=r-1,i=n.length;++u<i;)if(e(n[u],t))return u;return-1}function b(n){return n!==n}function w(n,t){var r=null==n?0:n.length;return r?k(n,t)/r:Cn}function m(n){return function(t){return null==t?X:t[n]}}function x(n){return function(t){return null==n?X:n[t]}}function j(n,t,r,e,u){return u(n,function(n,u,i){r=e?(e=!1,n):t(r,n,u,i)}),r}function A(n,t){var r=n.length;for(n.sort(t);r--;)n[r]=n[r].value;return n}function k(n,t){for(var r,e=-1,u=n.length;++e<u;){var i=t(n[e]);i!==X&&(r=r===X?i:r+i);
}return r}function O(n,t){for(var r=-1,e=Array(n);++r<n;)e[r]=t(r);return e}function I(n,t){return c(t,function(t){return[t,n[t]]})}function R(n){return n?n.slice(0,H(n)+1).replace(Lt,""):n}function z(n){return function(t){return n(t)}}function E(n,t){return c(t,function(t){return n[t]})}function S(n,t){return n.has(t)}function W(n,t){for(var r=-1,e=n.length;++r<e&&y(t,n[r],0)>-1;);return r}function L(n,t){for(var r=n.length;r--&&y(t,n[r],0)>-1;);return r}function C(n,t){for(var r=n.length,e=0;r--;)n[r]===t&&++e;
return e}function U(n){return"\\"+Yr[n]}function B(n,t){return null==n?X:n[t]}function T(n){return Nr.test(n)}function $(n){return Pr.test(n)}function D(n){for(var t,r=[];!(t=n.next()).done;)r.push(t.value);return r}function M(n){var t=-1,r=Array(n.size);return n.forEach(function(n,e){r[++t]=[e,n]}),r}function F(n,t){return function(r){return n(t(r))}}function N(n,t){for(var r=-1,e=n.length,u=0,i=[];++r<e;){var o=n[r];o!==t&&o!==cn||(n[r]=cn,i[u++]=r)}return i}function P(n){var t=-1,r=Array(n.size);
return n.forEach(function(n){r[++t]=n}),r}function q(n){var t=-1,r=Array(n.size);return n.forEach(function(n){r[++t]=[n,n]}),r}function Z(n,t,r){for(var e=r-1,u=n.length;++e<u;)if(n[e]===t)return e;return-1}function K(n,t,r){for(var e=r+1;e--;)if(n[e]===t)return e;return e}function V(n){return T(n)?J(n):_e(n)}function G(n){return T(n)?Y(n):p(n)}function H(n){for(var t=n.length;t--&&Ct.test(n.charAt(t)););return t}function J(n){for(var t=Mr.lastIndex=0;Mr.test(n);)++t;return t}function Y(n){return n.match(Mr)||[];
}function Q(n){return n.match(Fr)||[]}var X,nn="4.17.21",tn=200,rn="Unsupported core-js use. Try https://npms.io/search?q=ponyfill.",en="Expected a function",un="Invalid `variable` option passed into `_.template`",on="__lodash_hash_undefined__",fn=500,cn="__lodash_placeholder__",an=1,ln=2,sn=4,hn=1,pn=2,_n=1,vn=2,gn=4,yn=8,dn=16,bn=32,wn=64,mn=128,xn=256,jn=512,An=30,kn="...",On=800,In=16,Rn=1,zn=2,En=3,Sn=1/0,Wn=9007199254740991,Ln=1.7976931348623157e308,Cn=NaN,Un=4294967295,Bn=Un-1,Tn=Un>>>1,$n=[["ary",mn],["bind",_n],["bindKey",vn],["curry",yn],["curryRight",dn],["flip",jn],["partial",bn],["partialRight",wn],["rearg",xn]],Dn="[object Arguments]",Mn="[object Array]",Fn="[object AsyncFunction]",Nn="[object Boolean]",Pn="[object Date]",qn="[object DOMException]",Zn="[object Error]",Kn="[object Function]",Vn="[object GeneratorFunction]",Gn="[object Map]",Hn="[object Number]",Jn="[object Null]",Yn="[object Object]",Qn="[object Promise]",Xn="[object Proxy]",nt="[object RegExp]",tt="[object Set]",rt="[object String]",et="[object Symbol]",ut="[object Undefined]",it="[object WeakMap]",ot="[object WeakSet]",ft="[object ArrayBuffer]",ct="[object DataView]",at="[object Float32Array]",lt="[object Float64Array]",st="[object Int8Array]",ht="[object Int16Array]",pt="[object Int32Array]",_t="[object Uint8Array]",vt="[object Uint8ClampedArray]",gt="[object Uint16Array]",yt="[object Uint32Array]",dt=/\b__p \+= '';/g,bt=/\b(__p \+=) '' \+/g,wt=/(__e\(.*?\)|\b__t\)) \+\n'';/g,mt=/&(?:amp|lt|gt|quot|#39);/g,xt=/[&<>"']/g,jt=RegExp(mt.source),At=RegExp(xt.source),kt=/<%-([\s\S]+?)%>/g,Ot=/<%([\s\S]+?)%>/g,It=/<%=([\s\S]+?)%>/g,Rt=/\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,zt=/^\w*$/,Et=/[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,St=/[\\^$.*+?()[\]{}|]/g,Wt=RegExp(St.source),Lt=/^\s+/,Ct=/\s/,Ut=/\{(?:\n\/\* \[wrapped with .+\] \*\/)?\n?/,Bt=/\{\n\/\* \[wrapped with (.+)\] \*/,Tt=/,? & /,$t=/[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g,Dt=/[()=,{}\[\]\/\s]/,Mt=/\\(\\)?/g,Ft=/\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g,Nt=/\w*$/,Pt=/^[-+]0x[0-9a-f]+$/i,qt=/^0b[01]+$/i,Zt=/^\[object .+?Constructor\]$/,Kt=/^0o[0-7]+$/i,Vt=/^(?:0|[1-9]\d*)$/,Gt=/[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g,Ht=/($^)/,Jt=/['\n\r\u2028\u2029\\]/g,Yt="\\ud800-\\udfff",Qt="\\u0300-\\u036f",Xt="\\ufe20-\\ufe2f",nr="\\u20d0-\\u20ff",tr=Qt+Xt+nr,rr="\\u2700-\\u27bf",er="a-z\\xdf-\\xf6\\xf8-\\xff",ur="\\xac\\xb1\\xd7\\xf7",ir="\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf",or="\\u2000-\\u206f",fr=" \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000",cr="A-Z\\xc0-\\xd6\\xd8-\\xde",ar="\\ufe0e\\ufe0f",lr=ur+ir+or+fr,sr="['\u2019]",hr="["+Yt+"]",pr="["+lr+"]",_r="["+tr+"]",vr="\\d+",gr="["+rr+"]",yr="["+er+"]",dr="[^"+Yt+lr+vr+rr+er+cr+"]",br="\\ud83c[\\udffb-\\udfff]",wr="(?:"+_r+"|"+br+")",mr="[^"+Yt+"]",xr="(?:\\ud83c[\\udde6-\\uddff]){2}",jr="[\\ud800-\\udbff][\\udc00-\\udfff]",Ar="["+cr+"]",kr="\\u200d",Or="(?:"+yr+"|"+dr+")",Ir="(?:"+Ar+"|"+dr+")",Rr="(?:"+sr+"(?:d|ll|m|re|s|t|ve))?",zr="(?:"+sr+"(?:D|LL|M|RE|S|T|VE))?",Er=wr+"?",Sr="["+ar+"]?",Wr="(?:"+kr+"(?:"+[mr,xr,jr].join("|")+")"+Sr+Er+")*",Lr="\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])",Cr="\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])",Ur=Sr+Er+Wr,Br="(?:"+[gr,xr,jr].join("|")+")"+Ur,Tr="(?:"+[mr+_r+"?",_r,xr,jr,hr].join("|")+")",$r=RegExp(sr,"g"),Dr=RegExp(_r,"g"),Mr=RegExp(br+"(?="+br+")|"+Tr+Ur,"g"),Fr=RegExp([Ar+"?"+yr+"+"+Rr+"(?="+[pr,Ar,"$"].join("|")+")",Ir+"+"+zr+"(?="+[pr,Ar+Or,"$"].join("|")+")",Ar+"?"+Or+"+"+Rr,Ar+"+"+zr,Cr,Lr,vr,Br].join("|"),"g"),Nr=RegExp("["+kr+Yt+tr+ar+"]"),Pr=/[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/,qr=["Array","Buffer","DataView","Date","Error","Float32Array","Float64Array","Function","Int8Array","Int16Array","Int32Array","Map","Math","Object","Promise","RegExp","Set","String","Symbol","TypeError","Uint8Array","Uint8ClampedArray","Uint16Array","Uint32Array","WeakMap","_","clearTimeout","isFinite","parseInt","setTimeout"],Zr=-1,Kr={};
Kr[at]=Kr[lt]=Kr[st]=Kr[ht]=Kr[pt]=Kr[_t]=Kr[vt]=Kr[gt]=Kr[yt]=!0,Kr[Dn]=Kr[Mn]=Kr[ft]=Kr[Nn]=Kr[ct]=Kr[Pn]=Kr[Zn]=Kr[Kn]=Kr[Gn]=Kr[Hn]=Kr[Yn]=Kr[nt]=Kr[tt]=Kr[rt]=Kr[it]=!1;var Vr={};Vr[Dn]=Vr[Mn]=Vr[ft]=Vr[ct]=Vr[Nn]=Vr[Pn]=Vr[at]=Vr[lt]=Vr[st]=Vr[ht]=Vr[pt]=Vr[Gn]=Vr[Hn]=Vr[Yn]=Vr[nt]=Vr[tt]=Vr[rt]=Vr[et]=Vr[_t]=Vr[vt]=Vr[gt]=Vr[yt]=!0,Vr[Zn]=Vr[Kn]=Vr[it]=!1;var Gr={"\xc0":"A","\xc1":"A","\xc2":"A","\xc3":"A","\xc4":"A","\xc5":"A","\xe0":"a","\xe1":"a","\xe2":"a","\xe3":"a","\xe4":"a","\xe5":"a",
"\xc7":"C","\xe7":"c","\xd0":"D","\xf0":"d","\xc8":"E","\xc9":"E","\xca":"E","\xcb":"E","\xe8":"e","\xe9":"e","\xea":"e","\xeb":"e","\xcc":"I","\xcd":"I","\xce":"I","\xcf":"I","\xec":"i","\xed":"i","\xee":"i","\xef":"i","\xd1":"N","\xf1":"n","\xd2":"O","\xd3":"O","\xd4":"O","\xd5":"O","\xd6":"O","\xd8":"O","\xf2":"o","\xf3":"o","\xf4":"o","\xf5":"o","\xf6":"o","\xf8":"o","\xd9":"U","\xda":"U","\xdb":"U","\xdc":"U","\xf9":"u","\xfa":"u","\xfb":"u","\xfc":"u","\xdd":"Y","\xfd":"y","\xff":"y","\xc6":"Ae",
"\xe6":"ae","\xde":"Th","\xfe":"th","\xdf":"ss","\u0100":"A","\u0102":"A","\u0104":"A","\u0101":"a","\u0103":"a","\u0105":"a","\u0106":"C","\u0108":"C","\u010a":"C","\u010c":"C","\u0107":"c","\u0109":"c","\u010b":"c","\u010d":"c","\u010e":"D","\u0110":"D","\u010f":"d","\u0111":"d","\u0112":"E","\u0114":"E","\u0116":"E","\u0118":"E","\u011a":"E","\u0113":"e","\u0115":"e","\u0117":"e","\u0119":"e","\u011b":"e","\u011c":"G","\u011e":"G","\u0120":"G","\u0122":"G","\u011d":"g","\u011f":"g","\u0121":"g",
"\u0123":"g","\u0124":"H","\u0126":"H","\u0125":"h","\u0127":"h","\u0128":"I","\u012a":"I","\u012c":"I","\u012e":"I","\u0130":"I","\u0129":"i","\u012b":"i","\u012d":"i","\u012f":"i","\u0131":"i","\u0134":"J","\u0135":"j","\u0136":"K","\u0137":"k","\u0138":"k","\u0139":"L","\u013b":"L","\u013d":"L","\u013f":"L","\u0141":"L","\u013a":"l","\u013c":"l","\u013e":"l","\u0140":"l","\u0142":"l","\u0143":"N","\u0145":"N","\u0147":"N","\u014a":"N","\u0144":"n","\u0146":"n","\u0148":"n","\u014b":"n","\u014c":"O",
"\u014e":"O","\u0150":"O","\u014d":"o","\u014f":"o","\u0151":"o","\u0154":"R","\u0156":"R","\u0158":"R","\u0155":"r","\u0157":"r","\u0159":"r","\u015a":"S","\u015c":"S","\u015e":"S","\u0160":"S","\u015b":"s","\u015d":"s","\u015f":"s","\u0161":"s","\u0162":"T","\u0164":"T","\u0166":"T","\u0163":"t","\u0165":"t","\u0167":"t","\u0168":"U","\u016a":"U","\u016c":"U","\u016e":"U","\u0170":"U","\u0172":"U","\u0169":"u","\u016b":"u","\u016d":"u","\u016f":"u","\u0171":"u","\u0173":"u","\u0174":"W","\u0175":"w",
"\u0176":"Y","\u0177":"y","\u0178":"Y","\u0179":"Z","\u017b":"Z","\u017d":"Z","\u017a":"z","\u017c":"z","\u017e":"z","\u0132":"IJ","\u0133":"ij","\u0152":"Oe","\u0153":"oe","\u0149":"'n","\u017f":"s"},Hr={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"},Jr={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'"},Yr={"\\":"\\","'":"'","\n":"n","\r":"r","\u2028":"u2028","\u2029":"u2029"},Qr=parseFloat,Xr=parseInt,ne="object"==typeof global&&global&&global.Object===Object&&global,te="object"==typeof self&&self&&self.Object===Object&&self,re=ne||te||Function("return this")(),ee="object"==typeof exports&&exports&&!exports.nodeType&&exports,ue=ee&&"object"==typeof module&&module&&!module.nodeType&&module,ie=ue&&ue.exports===ee,oe=ie&&ne.process,fe=function(){
try{var n=ue&&ue.require&&ue.require("util").types;return n?n:oe&&oe.binding&&oe.binding("util")}catch(n){}}(),ce=fe&&fe.isArrayBuffer,ae=fe&&fe.isDate,le=fe&&fe.isMap,se=fe&&fe.isRegExp,he=fe&&fe.isSet,pe=fe&&fe.isTypedArray,_e=m("length"),ve=x(Gr),ge=x(Hr),ye=x(Jr),de=function p(x){function Z(n){if(cc(n)&&!bh(n)&&!(n instanceof Ct)){if(n instanceof Y)return n;if(bl.call(n,"__wrapped__"))return eo(n)}return new Y(n)}function J(){}function Y(n,t){this.__wrapped__=n,this.__actions__=[],this.__chain__=!!t,
this.__index__=0,this.__values__=X}function Ct(n){this.__wrapped__=n,this.__actions__=[],this.__dir__=1,this.__filtered__=!1,this.__iteratees__=[],this.__takeCount__=Un,this.__views__=[]}function $t(){var n=new Ct(this.__wrapped__);return n.__actions__=Tu(this.__actions__),n.__dir__=this.__dir__,n.__filtered__=this.__filtered__,n.__iteratees__=Tu(this.__iteratees__),n.__takeCount__=this.__takeCount__,n.__views__=Tu(this.__views__),n}function Yt(){if(this.__filtered__){var n=new Ct(this);n.__dir__=-1,
n.__filtered__=!0}else n=this.clone(),n.__dir__*=-1;return n}function Qt(){var n=this.__wrapped__.value(),t=this.__dir__,r=bh(n),e=t<0,u=r?n.length:0,i=Oi(0,u,this.__views__),o=i.start,f=i.end,c=f-o,a=e?f:o-1,l=this.__iteratees__,s=l.length,h=0,p=Hl(c,this.__takeCount__);if(!r||!e&&u==c&&p==c)return wu(n,this.__actions__);var _=[];n:for(;c--&&h<p;){a+=t;for(var v=-1,g=n[a];++v<s;){var y=l[v],d=y.iteratee,b=y.type,w=d(g);if(b==zn)g=w;else if(!w){if(b==Rn)continue n;break n}}_[h++]=g}return _}function Xt(n){
var t=-1,r=null==n?0:n.length;for(this.clear();++t<r;){var e=n[t];this.set(e[0],e[1])}}function nr(){this.__data__=is?is(null):{},this.size=0}function tr(n){var t=this.has(n)&&delete this.__data__[n];return this.size-=t?1:0,t}function rr(n){var t=this.__data__;if(is){var r=t[n];return r===on?X:r}return bl.call(t,n)?t[n]:X}function er(n){var t=this.__data__;return is?t[n]!==X:bl.call(t,n)}function ur(n,t){var r=this.__data__;return this.size+=this.has(n)?0:1,r[n]=is&&t===X?on:t,this}function ir(n){
var t=-1,r=null==n?0:n.length;for(this.clear();++t<r;){var e=n[t];this.set(e[0],e[1])}}function or(){this.__data__=[],this.size=0}function fr(n){var t=this.__data__,r=Wr(t,n);return!(r<0)&&(r==t.length-1?t.pop():Ll.call(t,r,1),--this.size,!0)}function cr(n){var t=this.__data__,r=Wr(t,n);return r<0?X:t[r][1]}function ar(n){return Wr(this.__data__,n)>-1}function lr(n,t){var r=this.__data__,e=Wr(r,n);return e<0?(++this.size,r.push([n,t])):r[e][1]=t,this}function sr(n){var t=-1,r=null==n?0:n.length;for(this.clear();++t<r;){
var e=n[t];this.set(e[0],e[1])}}function hr(){this.size=0,this.__data__={hash:new Xt,map:new(ts||ir),string:new Xt}}function pr(n){var t=xi(this,n).delete(n);return this.size-=t?1:0,t}function _r(n){return xi(this,n).get(n)}function vr(n){return xi(this,n).has(n)}function gr(n,t){var r=xi(this,n),e=r.size;return r.set(n,t),this.size+=r.size==e?0:1,this}function yr(n){var t=-1,r=null==n?0:n.length;for(this.__data__=new sr;++t<r;)this.add(n[t])}function dr(n){return this.__data__.set(n,on),this}function br(n){
return this.__data__.has(n)}function wr(n){this.size=(this.__data__=new ir(n)).size}function mr(){this.__data__=new ir,this.size=0}function xr(n){var t=this.__data__,r=t.delete(n);return this.size=t.size,r}function jr(n){return this.__data__.get(n)}function Ar(n){return this.__data__.has(n)}function kr(n,t){var r=this.__data__;if(r instanceof ir){var e=r.__data__;if(!ts||e.length<tn-1)return e.push([n,t]),this.size=++r.size,this;r=this.__data__=new sr(e)}return r.set(n,t),this.size=r.size,this}function Or(n,t){
var r=bh(n),e=!r&&dh(n),u=!r&&!e&&mh(n),i=!r&&!e&&!u&&Oh(n),o=r||e||u||i,f=o?O(n.length,hl):[],c=f.length;for(var a in n)!t&&!bl.call(n,a)||o&&("length"==a||u&&("offset"==a||"parent"==a)||i&&("buffer"==a||"byteLength"==a||"byteOffset"==a)||Ci(a,c))||f.push(a);return f}function Ir(n){var t=n.length;return t?n[tu(0,t-1)]:X}function Rr(n,t){return Xi(Tu(n),Mr(t,0,n.length))}function zr(n){return Xi(Tu(n))}function Er(n,t,r){(r===X||Gf(n[t],r))&&(r!==X||t in n)||Br(n,t,r)}function Sr(n,t,r){var e=n[t];
bl.call(n,t)&&Gf(e,r)&&(r!==X||t in n)||Br(n,t,r)}function Wr(n,t){for(var r=n.length;r--;)if(Gf(n[r][0],t))return r;return-1}function Lr(n,t,r,e){return ys(n,function(n,u,i){t(e,n,r(n),i)}),e}function Cr(n,t){return n&&$u(t,Pc(t),n)}function Ur(n,t){return n&&$u(t,qc(t),n)}function Br(n,t,r){"__proto__"==t&&Tl?Tl(n,t,{configurable:!0,enumerable:!0,value:r,writable:!0}):n[t]=r}function Tr(n,t){for(var r=-1,e=t.length,u=il(e),i=null==n;++r<e;)u[r]=i?X:Mc(n,t[r]);return u}function Mr(n,t,r){return n===n&&(r!==X&&(n=n<=r?n:r),
t!==X&&(n=n>=t?n:t)),n}function Fr(n,t,e,u,i,o){var f,c=t&an,a=t&ln,l=t&sn;if(e&&(f=i?e(n,u,i,o):e(n)),f!==X)return f;if(!fc(n))return n;var s=bh(n);if(s){if(f=zi(n),!c)return Tu(n,f)}else{var h=zs(n),p=h==Kn||h==Vn;if(mh(n))return Iu(n,c);if(h==Yn||h==Dn||p&&!i){if(f=a||p?{}:Ei(n),!c)return a?Mu(n,Ur(f,n)):Du(n,Cr(f,n))}else{if(!Vr[h])return i?n:{};f=Si(n,h,c)}}o||(o=new wr);var _=o.get(n);if(_)return _;o.set(n,f),kh(n)?n.forEach(function(r){f.add(Fr(r,t,e,r,n,o))}):jh(n)&&n.forEach(function(r,u){
f.set(u,Fr(r,t,e,u,n,o))});var v=l?a?di:yi:a?qc:Pc,g=s?X:v(n);return r(g||n,function(r,u){g&&(u=r,r=n[u]),Sr(f,u,Fr(r,t,e,u,n,o))}),f}function Nr(n){var t=Pc(n);return function(r){return Pr(r,n,t)}}function Pr(n,t,r){var e=r.length;if(null==n)return!e;for(n=ll(n);e--;){var u=r[e],i=t[u],o=n[u];if(o===X&&!(u in n)||!i(o))return!1}return!0}function Gr(n,t,r){if("function"!=typeof n)throw new pl(en);return Ws(function(){n.apply(X,r)},t)}function Hr(n,t,r,e){var u=-1,i=o,a=!0,l=n.length,s=[],h=t.length;
if(!l)return s;r&&(t=c(t,z(r))),e?(i=f,a=!1):t.length>=tn&&(i=S,a=!1,t=new yr(t));n:for(;++u<l;){var p=n[u],_=null==r?p:r(p);if(p=e||0!==p?p:0,a&&_===_){for(var v=h;v--;)if(t[v]===_)continue n;s.push(p)}else i(t,_,e)||s.push(p)}return s}function Jr(n,t){var r=!0;return ys(n,function(n,e,u){return r=!!t(n,e,u)}),r}function Yr(n,t,r){for(var e=-1,u=n.length;++e<u;){var i=n[e],o=t(i);if(null!=o&&(f===X?o===o&&!bc(o):r(o,f)))var f=o,c=i}return c}function ne(n,t,r,e){var u=n.length;for(r=kc(r),r<0&&(r=-r>u?0:u+r),
e=e===X||e>u?u:kc(e),e<0&&(e+=u),e=r>e?0:Oc(e);r<e;)n[r++]=t;return n}function te(n,t){var r=[];return ys(n,function(n,e,u){t(n,e,u)&&r.push(n)}),r}function ee(n,t,r,e,u){var i=-1,o=n.length;for(r||(r=Li),u||(u=[]);++i<o;){var f=n[i];t>0&&r(f)?t>1?ee(f,t-1,r,e,u):a(u,f):e||(u[u.length]=f)}return u}function ue(n,t){return n&&bs(n,t,Pc)}function oe(n,t){return n&&ws(n,t,Pc)}function fe(n,t){return i(t,function(t){return uc(n[t])})}function _e(n,t){t=ku(t,n);for(var r=0,e=t.length;null!=n&&r<e;)n=n[no(t[r++])];
return r&&r==e?n:X}function de(n,t,r){var e=t(n);return bh(n)?e:a(e,r(n))}function we(n){return null==n?n===X?ut:Jn:Bl&&Bl in ll(n)?ki(n):Ki(n)}function me(n,t){return n>t}function xe(n,t){return null!=n&&bl.call(n,t)}function je(n,t){return null!=n&&t in ll(n)}function Ae(n,t,r){return n>=Hl(t,r)&&n<Gl(t,r)}function ke(n,t,r){for(var e=r?f:o,u=n[0].length,i=n.length,a=i,l=il(i),s=1/0,h=[];a--;){var p=n[a];a&&t&&(p=c(p,z(t))),s=Hl(p.length,s),l[a]=!r&&(t||u>=120&&p.length>=120)?new yr(a&&p):X}p=n[0];
var _=-1,v=l[0];n:for(;++_<u&&h.length<s;){var g=p[_],y=t?t(g):g;if(g=r||0!==g?g:0,!(v?S(v,y):e(h,y,r))){for(a=i;--a;){var d=l[a];if(!(d?S(d,y):e(n[a],y,r)))continue n}v&&v.push(y),h.push(g)}}return h}function Oe(n,t,r,e){return ue(n,function(n,u,i){t(e,r(n),u,i)}),e}function Ie(t,r,e){r=ku(r,t),t=Gi(t,r);var u=null==t?t:t[no(jo(r))];return null==u?X:n(u,t,e)}function Re(n){return cc(n)&&we(n)==Dn}function ze(n){return cc(n)&&we(n)==ft}function Ee(n){return cc(n)&&we(n)==Pn}function Se(n,t,r,e,u){
return n===t||(null==n||null==t||!cc(n)&&!cc(t)?n!==n&&t!==t:We(n,t,r,e,Se,u))}function We(n,t,r,e,u,i){var o=bh(n),f=bh(t),c=o?Mn:zs(n),a=f?Mn:zs(t);c=c==Dn?Yn:c,a=a==Dn?Yn:a;var l=c==Yn,s=a==Yn,h=c==a;if(h&&mh(n)){if(!mh(t))return!1;o=!0,l=!1}if(h&&!l)return i||(i=new wr),o||Oh(n)?pi(n,t,r,e,u,i):_i(n,t,c,r,e,u,i);if(!(r&hn)){var p=l&&bl.call(n,"__wrapped__"),_=s&&bl.call(t,"__wrapped__");if(p||_){var v=p?n.value():n,g=_?t.value():t;return i||(i=new wr),u(v,g,r,e,i)}}return!!h&&(i||(i=new wr),vi(n,t,r,e,u,i));
}function Le(n){return cc(n)&&zs(n)==Gn}function Ce(n,t,r,e){var u=r.length,i=u,o=!e;if(null==n)return!i;for(n=ll(n);u--;){var f=r[u];if(o&&f[2]?f[1]!==n[f[0]]:!(f[0]in n))return!1}for(;++u<i;){f=r[u];var c=f[0],a=n[c],l=f[1];if(o&&f[2]){if(a===X&&!(c in n))return!1}else{var s=new wr;if(e)var h=e(a,l,c,n,t,s);if(!(h===X?Se(l,a,hn|pn,e,s):h))return!1}}return!0}function Ue(n){return!(!fc(n)||Di(n))&&(uc(n)?kl:Zt).test(to(n))}function Be(n){return cc(n)&&we(n)==nt}function Te(n){return cc(n)&&zs(n)==tt;
}function $e(n){return cc(n)&&oc(n.length)&&!!Kr[we(n)]}function De(n){return"function"==typeof n?n:null==n?La:"object"==typeof n?bh(n)?Ze(n[0],n[1]):qe(n):Fa(n)}function Me(n){if(!Mi(n))return Vl(n);var t=[];for(var r in ll(n))bl.call(n,r)&&"constructor"!=r&&t.push(r);return t}function Fe(n){if(!fc(n))return Zi(n);var t=Mi(n),r=[];for(var e in n)("constructor"!=e||!t&&bl.call(n,e))&&r.push(e);return r}function Ne(n,t){return n<t}function Pe(n,t){var r=-1,e=Hf(n)?il(n.length):[];return ys(n,function(n,u,i){
e[++r]=t(n,u,i)}),e}function qe(n){var t=ji(n);return 1==t.length&&t[0][2]?Ni(t[0][0],t[0][1]):function(r){return r===n||Ce(r,n,t)}}function Ze(n,t){return Bi(n)&&Fi(t)?Ni(no(n),t):function(r){var e=Mc(r,n);return e===X&&e===t?Nc(r,n):Se(t,e,hn|pn)}}function Ke(n,t,r,e,u){n!==t&&bs(t,function(i,o){if(u||(u=new wr),fc(i))Ve(n,t,o,r,Ke,e,u);else{var f=e?e(Ji(n,o),i,o+"",n,t,u):X;f===X&&(f=i),Er(n,o,f)}},qc)}function Ve(n,t,r,e,u,i,o){var f=Ji(n,r),c=Ji(t,r),a=o.get(c);if(a)return Er(n,r,a),X;var l=i?i(f,c,r+"",n,t,o):X,s=l===X;
if(s){var h=bh(c),p=!h&&mh(c),_=!h&&!p&&Oh(c);l=c,h||p||_?bh(f)?l=f:Jf(f)?l=Tu(f):p?(s=!1,l=Iu(c,!0)):_?(s=!1,l=Wu(c,!0)):l=[]:gc(c)||dh(c)?(l=f,dh(f)?l=Rc(f):fc(f)&&!uc(f)||(l=Ei(c))):s=!1}s&&(o.set(c,l),u(l,c,e,i,o),o.delete(c)),Er(n,r,l)}function Ge(n,t){var r=n.length;if(r)return t+=t<0?r:0,Ci(t,r)?n[t]:X}function He(n,t,r){t=t.length?c(t,function(n){return bh(n)?function(t){return _e(t,1===n.length?n[0]:n)}:n}):[La];var e=-1;return t=c(t,z(mi())),A(Pe(n,function(n,r,u){return{criteria:c(t,function(t){
return t(n)}),index:++e,value:n}}),function(n,t){return Cu(n,t,r)})}function Je(n,t){return Ye(n,t,function(t,r){return Nc(n,r)})}function Ye(n,t,r){for(var e=-1,u=t.length,i={};++e<u;){var o=t[e],f=_e(n,o);r(f,o)&&fu(i,ku(o,n),f)}return i}function Qe(n){return function(t){return _e(t,n)}}function Xe(n,t,r,e){var u=e?d:y,i=-1,o=t.length,f=n;for(n===t&&(t=Tu(t)),r&&(f=c(n,z(r)));++i<o;)for(var a=0,l=t[i],s=r?r(l):l;(a=u(f,s,a,e))>-1;)f!==n&&Ll.call(f,a,1),Ll.call(n,a,1);return n}function nu(n,t){for(var r=n?t.length:0,e=r-1;r--;){
var u=t[r];if(r==e||u!==i){var i=u;Ci(u)?Ll.call(n,u,1):yu(n,u)}}return n}function tu(n,t){return n+Nl(Ql()*(t-n+1))}function ru(n,t,r,e){for(var u=-1,i=Gl(Fl((t-n)/(r||1)),0),o=il(i);i--;)o[e?i:++u]=n,n+=r;return o}function eu(n,t){var r="";if(!n||t<1||t>Wn)return r;do t%2&&(r+=n),t=Nl(t/2),t&&(n+=n);while(t);return r}function uu(n,t){return Ls(Vi(n,t,La),n+"")}function iu(n){return Ir(ra(n))}function ou(n,t){var r=ra(n);return Xi(r,Mr(t,0,r.length))}function fu(n,t,r,e){if(!fc(n))return n;t=ku(t,n);
for(var u=-1,i=t.length,o=i-1,f=n;null!=f&&++u<i;){var c=no(t[u]),a=r;if("__proto__"===c||"constructor"===c||"prototype"===c)return n;if(u!=o){var l=f[c];a=e?e(l,c,f):X,a===X&&(a=fc(l)?l:Ci(t[u+1])?[]:{})}Sr(f,c,a),f=f[c]}return n}function cu(n){return Xi(ra(n))}function au(n,t,r){var e=-1,u=n.length;t<0&&(t=-t>u?0:u+t),r=r>u?u:r,r<0&&(r+=u),u=t>r?0:r-t>>>0,t>>>=0;for(var i=il(u);++e<u;)i[e]=n[e+t];return i}function lu(n,t){var r;return ys(n,function(n,e,u){return r=t(n,e,u),!r}),!!r}function su(n,t,r){
var e=0,u=null==n?e:n.length;if("number"==typeof t&&t===t&&u<=Tn){for(;e<u;){var i=e+u>>>1,o=n[i];null!==o&&!bc(o)&&(r?o<=t:o<t)?e=i+1:u=i}return u}return hu(n,t,La,r)}function hu(n,t,r,e){var u=0,i=null==n?0:n.length;if(0===i)return 0;t=r(t);for(var o=t!==t,f=null===t,c=bc(t),a=t===X;u<i;){var l=Nl((u+i)/2),s=r(n[l]),h=s!==X,p=null===s,_=s===s,v=bc(s);if(o)var g=e||_;else g=a?_&&(e||h):f?_&&h&&(e||!p):c?_&&h&&!p&&(e||!v):!p&&!v&&(e?s<=t:s<t);g?u=l+1:i=l}return Hl(i,Bn)}function pu(n,t){for(var r=-1,e=n.length,u=0,i=[];++r<e;){
var o=n[r],f=t?t(o):o;if(!r||!Gf(f,c)){var c=f;i[u++]=0===o?0:o}}return i}function _u(n){return"number"==typeof n?n:bc(n)?Cn:+n}function vu(n){if("string"==typeof n)return n;if(bh(n))return c(n,vu)+"";if(bc(n))return vs?vs.call(n):"";var t=n+"";return"0"==t&&1/n==-Sn?"-0":t}function gu(n,t,r){var e=-1,u=o,i=n.length,c=!0,a=[],l=a;if(r)c=!1,u=f;else if(i>=tn){var s=t?null:ks(n);if(s)return P(s);c=!1,u=S,l=new yr}else l=t?[]:a;n:for(;++e<i;){var h=n[e],p=t?t(h):h;if(h=r||0!==h?h:0,c&&p===p){for(var _=l.length;_--;)if(l[_]===p)continue n;
t&&l.push(p),a.push(h)}else u(l,p,r)||(l!==a&&l.push(p),a.push(h))}return a}function yu(n,t){return t=ku(t,n),n=Gi(n,t),null==n||delete n[no(jo(t))]}function du(n,t,r,e){return fu(n,t,r(_e(n,t)),e)}function bu(n,t,r,e){for(var u=n.length,i=e?u:-1;(e?i--:++i<u)&&t(n[i],i,n););return r?au(n,e?0:i,e?i+1:u):au(n,e?i+1:0,e?u:i)}function wu(n,t){var r=n;return r instanceof Ct&&(r=r.value()),l(t,function(n,t){return t.func.apply(t.thisArg,a([n],t.args))},r)}function mu(n,t,r){var e=n.length;if(e<2)return e?gu(n[0]):[];
for(var u=-1,i=il(e);++u<e;)for(var o=n[u],f=-1;++f<e;)f!=u&&(i[u]=Hr(i[u]||o,n[f],t,r));return gu(ee(i,1),t,r)}function xu(n,t,r){for(var e=-1,u=n.length,i=t.length,o={};++e<u;){r(o,n[e],e<i?t[e]:X)}return o}function ju(n){return Jf(n)?n:[]}function Au(n){return"function"==typeof n?n:La}function ku(n,t){return bh(n)?n:Bi(n,t)?[n]:Cs(Ec(n))}function Ou(n,t,r){var e=n.length;return r=r===X?e:r,!t&&r>=e?n:au(n,t,r)}function Iu(n,t){if(t)return n.slice();var r=n.length,e=zl?zl(r):new n.constructor(r);
return n.copy(e),e}function Ru(n){var t=new n.constructor(n.byteLength);return new Rl(t).set(new Rl(n)),t}function zu(n,t){return new n.constructor(t?Ru(n.buffer):n.buffer,n.byteOffset,n.byteLength)}function Eu(n){var t=new n.constructor(n.source,Nt.exec(n));return t.lastIndex=n.lastIndex,t}function Su(n){return _s?ll(_s.call(n)):{}}function Wu(n,t){return new n.constructor(t?Ru(n.buffer):n.buffer,n.byteOffset,n.length)}function Lu(n,t){if(n!==t){var r=n!==X,e=null===n,u=n===n,i=bc(n),o=t!==X,f=null===t,c=t===t,a=bc(t);
if(!f&&!a&&!i&&n>t||i&&o&&c&&!f&&!a||e&&o&&c||!r&&c||!u)return 1;if(!e&&!i&&!a&&n<t||a&&r&&u&&!e&&!i||f&&r&&u||!o&&u||!c)return-1}return 0}function Cu(n,t,r){for(var e=-1,u=n.criteria,i=t.criteria,o=u.length,f=r.length;++e<o;){var c=Lu(u[e],i[e]);if(c){if(e>=f)return c;return c*("desc"==r[e]?-1:1)}}return n.index-t.index}function Uu(n,t,r,e){for(var u=-1,i=n.length,o=r.length,f=-1,c=t.length,a=Gl(i-o,0),l=il(c+a),s=!e;++f<c;)l[f]=t[f];for(;++u<o;)(s||u<i)&&(l[r[u]]=n[u]);for(;a--;)l[f++]=n[u++];return l;
}function Bu(n,t,r,e){for(var u=-1,i=n.length,o=-1,f=r.length,c=-1,a=t.length,l=Gl(i-f,0),s=il(l+a),h=!e;++u<l;)s[u]=n[u];for(var p=u;++c<a;)s[p+c]=t[c];for(;++o<f;)(h||u<i)&&(s[p+r[o]]=n[u++]);return s}function Tu(n,t){var r=-1,e=n.length;for(t||(t=il(e));++r<e;)t[r]=n[r];return t}function $u(n,t,r,e){var u=!r;r||(r={});for(var i=-1,o=t.length;++i<o;){var f=t[i],c=e?e(r[f],n[f],f,r,n):X;c===X&&(c=n[f]),u?Br(r,f,c):Sr(r,f,c)}return r}function Du(n,t){return $u(n,Is(n),t)}function Mu(n,t){return $u(n,Rs(n),t);
}function Fu(n,r){return function(e,u){var i=bh(e)?t:Lr,o=r?r():{};return i(e,n,mi(u,2),o)}}function Nu(n){return uu(function(t,r){var e=-1,u=r.length,i=u>1?r[u-1]:X,o=u>2?r[2]:X;for(i=n.length>3&&"function"==typeof i?(u--,i):X,o&&Ui(r[0],r[1],o)&&(i=u<3?X:i,u=1),t=ll(t);++e<u;){var f=r[e];f&&n(t,f,e,i)}return t})}function Pu(n,t){return function(r,e){if(null==r)return r;if(!Hf(r))return n(r,e);for(var u=r.length,i=t?u:-1,o=ll(r);(t?i--:++i<u)&&e(o[i],i,o)!==!1;);return r}}function qu(n){return function(t,r,e){
for(var u=-1,i=ll(t),o=e(t),f=o.length;f--;){var c=o[n?f:++u];if(r(i[c],c,i)===!1)break}return t}}function Zu(n,t,r){function e(){return(this&&this!==re&&this instanceof e?i:n).apply(u?r:this,arguments)}var u=t&_n,i=Gu(n);return e}function Ku(n){return function(t){t=Ec(t);var r=T(t)?G(t):X,e=r?r[0]:t.charAt(0),u=r?Ou(r,1).join(""):t.slice(1);return e[n]()+u}}function Vu(n){return function(t){return l(Ra(ca(t).replace($r,"")),n,"")}}function Gu(n){return function(){var t=arguments;switch(t.length){
case 0:return new n;case 1:return new n(t[0]);case 2:return new n(t[0],t[1]);case 3:return new n(t[0],t[1],t[2]);case 4:return new n(t[0],t[1],t[2],t[3]);case 5:return new n(t[0],t[1],t[2],t[3],t[4]);case 6:return new n(t[0],t[1],t[2],t[3],t[4],t[5]);case 7:return new n(t[0],t[1],t[2],t[3],t[4],t[5],t[6])}var r=gs(n.prototype),e=n.apply(r,t);return fc(e)?e:r}}function Hu(t,r,e){function u(){for(var o=arguments.length,f=il(o),c=o,a=wi(u);c--;)f[c]=arguments[c];var l=o<3&&f[0]!==a&&f[o-1]!==a?[]:N(f,a);
return o-=l.length,o<e?oi(t,r,Qu,u.placeholder,X,f,l,X,X,e-o):n(this&&this!==re&&this instanceof u?i:t,this,f)}var i=Gu(t);return u}function Ju(n){return function(t,r,e){var u=ll(t);if(!Hf(t)){var i=mi(r,3);t=Pc(t),r=function(n){return i(u[n],n,u)}}var o=n(t,r,e);return o>-1?u[i?t[o]:o]:X}}function Yu(n){return gi(function(t){var r=t.length,e=r,u=Y.prototype.thru;for(n&&t.reverse();e--;){var i=t[e];if("function"!=typeof i)throw new pl(en);if(u&&!o&&"wrapper"==bi(i))var o=new Y([],!0)}for(e=o?e:r;++e<r;){
i=t[e];var f=bi(i),c="wrapper"==f?Os(i):X;o=c&&$i(c[0])&&c[1]==(mn|yn|bn|xn)&&!c[4].length&&1==c[9]?o[bi(c[0])].apply(o,c[3]):1==i.length&&$i(i)?o[f]():o.thru(i)}return function(){var n=arguments,e=n[0];if(o&&1==n.length&&bh(e))return o.plant(e).value();for(var u=0,i=r?t[u].apply(this,n):e;++u<r;)i=t[u].call(this,i);return i}})}function Qu(n,t,r,e,u,i,o,f,c,a){function l(){for(var y=arguments.length,d=il(y),b=y;b--;)d[b]=arguments[b];if(_)var w=wi(l),m=C(d,w);if(e&&(d=Uu(d,e,u,_)),i&&(d=Bu(d,i,o,_)),
y-=m,_&&y<a){return oi(n,t,Qu,l.placeholder,r,d,N(d,w),f,c,a-y)}var x=h?r:this,j=p?x[n]:n;return y=d.length,f?d=Hi(d,f):v&&y>1&&d.reverse(),s&&c<y&&(d.length=c),this&&this!==re&&this instanceof l&&(j=g||Gu(j)),j.apply(x,d)}var s=t&mn,h=t&_n,p=t&vn,_=t&(yn|dn),v=t&jn,g=p?X:Gu(n);return l}function Xu(n,t){return function(r,e){return Oe(r,n,t(e),{})}}function ni(n,t){return function(r,e){var u;if(r===X&&e===X)return t;if(r!==X&&(u=r),e!==X){if(u===X)return e;"string"==typeof r||"string"==typeof e?(r=vu(r),
e=vu(e)):(r=_u(r),e=_u(e)),u=n(r,e)}return u}}function ti(t){return gi(function(r){return r=c(r,z(mi())),uu(function(e){var u=this;return t(r,function(t){return n(t,u,e)})})})}function ri(n,t){t=t===X?" ":vu(t);var r=t.length;if(r<2)return r?eu(t,n):t;var e=eu(t,Fl(n/V(t)));return T(t)?Ou(G(e),0,n).join(""):e.slice(0,n)}function ei(t,r,e,u){function i(){for(var r=-1,c=arguments.length,a=-1,l=u.length,s=il(l+c),h=this&&this!==re&&this instanceof i?f:t;++a<l;)s[a]=u[a];for(;c--;)s[a++]=arguments[++r];
return n(h,o?e:this,s)}var o=r&_n,f=Gu(t);return i}function ui(n){return function(t,r,e){return e&&"number"!=typeof e&&Ui(t,r,e)&&(r=e=X),t=Ac(t),r===X?(r=t,t=0):r=Ac(r),e=e===X?t<r?1:-1:Ac(e),ru(t,r,e,n)}}function ii(n){return function(t,r){return"string"==typeof t&&"string"==typeof r||(t=Ic(t),r=Ic(r)),n(t,r)}}function oi(n,t,r,e,u,i,o,f,c,a){var l=t&yn,s=l?o:X,h=l?X:o,p=l?i:X,_=l?X:i;t|=l?bn:wn,t&=~(l?wn:bn),t&gn||(t&=~(_n|vn));var v=[n,t,u,p,s,_,h,f,c,a],g=r.apply(X,v);return $i(n)&&Ss(g,v),g.placeholder=e,
Yi(g,n,t)}function fi(n){var t=al[n];return function(n,r){if(n=Ic(n),r=null==r?0:Hl(kc(r),292),r&&Zl(n)){var e=(Ec(n)+"e").split("e");return e=(Ec(t(e[0]+"e"+(+e[1]+r)))+"e").split("e"),+(e[0]+"e"+(+e[1]-r))}return t(n)}}function ci(n){return function(t){var r=zs(t);return r==Gn?M(t):r==tt?q(t):I(t,n(t))}}function ai(n,t,r,e,u,i,o,f){var c=t&vn;if(!c&&"function"!=typeof n)throw new pl(en);var a=e?e.length:0;if(a||(t&=~(bn|wn),e=u=X),o=o===X?o:Gl(kc(o),0),f=f===X?f:kc(f),a-=u?u.length:0,t&wn){var l=e,s=u;
e=u=X}var h=c?X:Os(n),p=[n,t,r,e,u,l,s,i,o,f];if(h&&qi(p,h),n=p[0],t=p[1],r=p[2],e=p[3],u=p[4],f=p[9]=p[9]===X?c?0:n.length:Gl(p[9]-a,0),!f&&t&(yn|dn)&&(t&=~(yn|dn)),t&&t!=_n)_=t==yn||t==dn?Hu(n,t,f):t!=bn&&t!=(_n|bn)||u.length?Qu.apply(X,p):ei(n,t,r,e);else var _=Zu(n,t,r);return Yi((h?ms:Ss)(_,p),n,t)}function li(n,t,r,e){return n===X||Gf(n,gl[r])&&!bl.call(e,r)?t:n}function si(n,t,r,e,u,i){return fc(n)&&fc(t)&&(i.set(t,n),Ke(n,t,X,si,i),i.delete(t)),n}function hi(n){return gc(n)?X:n}function pi(n,t,r,e,u,i){
var o=r&hn,f=n.length,c=t.length;if(f!=c&&!(o&&c>f))return!1;var a=i.get(n),l=i.get(t);if(a&&l)return a==t&&l==n;var s=-1,p=!0,_=r&pn?new yr:X;for(i.set(n,t),i.set(t,n);++s<f;){var v=n[s],g=t[s];if(e)var y=o?e(g,v,s,t,n,i):e(v,g,s,n,t,i);if(y!==X){if(y)continue;p=!1;break}if(_){if(!h(t,function(n,t){if(!S(_,t)&&(v===n||u(v,n,r,e,i)))return _.push(t)})){p=!1;break}}else if(v!==g&&!u(v,g,r,e,i)){p=!1;break}}return i.delete(n),i.delete(t),p}function _i(n,t,r,e,u,i,o){switch(r){case ct:if(n.byteLength!=t.byteLength||n.byteOffset!=t.byteOffset)return!1;
n=n.buffer,t=t.buffer;case ft:return!(n.byteLength!=t.byteLength||!i(new Rl(n),new Rl(t)));case Nn:case Pn:case Hn:return Gf(+n,+t);case Zn:return n.name==t.name&&n.message==t.message;case nt:case rt:return n==t+"";case Gn:var f=M;case tt:var c=e&hn;if(f||(f=P),n.size!=t.size&&!c)return!1;var a=o.get(n);if(a)return a==t;e|=pn,o.set(n,t);var l=pi(f(n),f(t),e,u,i,o);return o.delete(n),l;case et:if(_s)return _s.call(n)==_s.call(t)}return!1}function vi(n,t,r,e,u,i){var o=r&hn,f=yi(n),c=f.length;if(c!=yi(t).length&&!o)return!1;
for(var a=c;a--;){var l=f[a];if(!(o?l in t:bl.call(t,l)))return!1}var s=i.get(n),h=i.get(t);if(s&&h)return s==t&&h==n;var p=!0;i.set(n,t),i.set(t,n);for(var _=o;++a<c;){l=f[a];var v=n[l],g=t[l];if(e)var y=o?e(g,v,l,t,n,i):e(v,g,l,n,t,i);if(!(y===X?v===g||u(v,g,r,e,i):y)){p=!1;break}_||(_="constructor"==l)}if(p&&!_){var d=n.constructor,b=t.constructor;d!=b&&"constructor"in n&&"constructor"in t&&!("function"==typeof d&&d instanceof d&&"function"==typeof b&&b instanceof b)&&(p=!1)}return i.delete(n),
i.delete(t),p}function gi(n){return Ls(Vi(n,X,_o),n+"")}function yi(n){return de(n,Pc,Is)}function di(n){return de(n,qc,Rs)}function bi(n){for(var t=n.name+"",r=fs[t],e=bl.call(fs,t)?r.length:0;e--;){var u=r[e],i=u.func;if(null==i||i==n)return u.name}return t}function wi(n){return(bl.call(Z,"placeholder")?Z:n).placeholder}function mi(){var n=Z.iteratee||Ca;return n=n===Ca?De:n,arguments.length?n(arguments[0],arguments[1]):n}function xi(n,t){var r=n.__data__;return Ti(t)?r["string"==typeof t?"string":"hash"]:r.map;
}function ji(n){for(var t=Pc(n),r=t.length;r--;){var e=t[r],u=n[e];t[r]=[e,u,Fi(u)]}return t}function Ai(n,t){var r=B(n,t);return Ue(r)?r:X}function ki(n){var t=bl.call(n,Bl),r=n[Bl];try{n[Bl]=X;var e=!0}catch(n){}var u=xl.call(n);return e&&(t?n[Bl]=r:delete n[Bl]),u}function Oi(n,t,r){for(var e=-1,u=r.length;++e<u;){var i=r[e],o=i.size;switch(i.type){case"drop":n+=o;break;case"dropRight":t-=o;break;case"take":t=Hl(t,n+o);break;case"takeRight":n=Gl(n,t-o)}}return{start:n,end:t}}function Ii(n){var t=n.match(Bt);
return t?t[1].split(Tt):[]}function Ri(n,t,r){t=ku(t,n);for(var e=-1,u=t.length,i=!1;++e<u;){var o=no(t[e]);if(!(i=null!=n&&r(n,o)))break;n=n[o]}return i||++e!=u?i:(u=null==n?0:n.length,!!u&&oc(u)&&Ci(o,u)&&(bh(n)||dh(n)))}function zi(n){var t=n.length,r=new n.constructor(t);return t&&"string"==typeof n[0]&&bl.call(n,"index")&&(r.index=n.index,r.input=n.input),r}function Ei(n){return"function"!=typeof n.constructor||Mi(n)?{}:gs(El(n))}function Si(n,t,r){var e=n.constructor;switch(t){case ft:return Ru(n);
case Nn:case Pn:return new e(+n);case ct:return zu(n,r);case at:case lt:case st:case ht:case pt:case _t:case vt:case gt:case yt:return Wu(n,r);case Gn:return new e;case Hn:case rt:return new e(n);case nt:return Eu(n);case tt:return new e;case et:return Su(n)}}function Wi(n,t){var r=t.length;if(!r)return n;var e=r-1;return t[e]=(r>1?"& ":"")+t[e],t=t.join(r>2?", ":" "),n.replace(Ut,"{\n/* [wrapped with "+t+"] */\n")}function Li(n){return bh(n)||dh(n)||!!(Cl&&n&&n[Cl])}function Ci(n,t){var r=typeof n;
return t=null==t?Wn:t,!!t&&("number"==r||"symbol"!=r&&Vt.test(n))&&n>-1&&n%1==0&&n<t}function Ui(n,t,r){if(!fc(r))return!1;var e=typeof t;return!!("number"==e?Hf(r)&&Ci(t,r.length):"string"==e&&t in r)&&Gf(r[t],n)}function Bi(n,t){if(bh(n))return!1;var r=typeof n;return!("number"!=r&&"symbol"!=r&&"boolean"!=r&&null!=n&&!bc(n))||(zt.test(n)||!Rt.test(n)||null!=t&&n in ll(t))}function Ti(n){var t=typeof n;return"string"==t||"number"==t||"symbol"==t||"boolean"==t?"__proto__"!==n:null===n}function $i(n){
var t=bi(n),r=Z[t];if("function"!=typeof r||!(t in Ct.prototype))return!1;if(n===r)return!0;var e=Os(r);return!!e&&n===e[0]}function Di(n){return!!ml&&ml in n}function Mi(n){var t=n&&n.constructor;return n===("function"==typeof t&&t.prototype||gl)}function Fi(n){return n===n&&!fc(n)}function Ni(n,t){return function(r){return null!=r&&(r[n]===t&&(t!==X||n in ll(r)))}}function Pi(n){var t=Cf(n,function(n){return r.size===fn&&r.clear(),n}),r=t.cache;return t}function qi(n,t){var r=n[1],e=t[1],u=r|e,i=u<(_n|vn|mn),o=e==mn&&r==yn||e==mn&&r==xn&&n[7].length<=t[8]||e==(mn|xn)&&t[7].length<=t[8]&&r==yn;
if(!i&&!o)return n;e&_n&&(n[2]=t[2],u|=r&_n?0:gn);var f=t[3];if(f){var c=n[3];n[3]=c?Uu(c,f,t[4]):f,n[4]=c?N(n[3],cn):t[4]}return f=t[5],f&&(c=n[5],n[5]=c?Bu(c,f,t[6]):f,n[6]=c?N(n[5],cn):t[6]),f=t[7],f&&(n[7]=f),e&mn&&(n[8]=null==n[8]?t[8]:Hl(n[8],t[8])),null==n[9]&&(n[9]=t[9]),n[0]=t[0],n[1]=u,n}function Zi(n){var t=[];if(null!=n)for(var r in ll(n))t.push(r);return t}function Ki(n){return xl.call(n)}function Vi(t,r,e){return r=Gl(r===X?t.length-1:r,0),function(){for(var u=arguments,i=-1,o=Gl(u.length-r,0),f=il(o);++i<o;)f[i]=u[r+i];
i=-1;for(var c=il(r+1);++i<r;)c[i]=u[i];return c[r]=e(f),n(t,this,c)}}function Gi(n,t){return t.length<2?n:_e(n,au(t,0,-1))}function Hi(n,t){for(var r=n.length,e=Hl(t.length,r),u=Tu(n);e--;){var i=t[e];n[e]=Ci(i,r)?u[i]:X}return n}function Ji(n,t){if(("constructor"!==t||"function"!=typeof n[t])&&"__proto__"!=t)return n[t]}function Yi(n,t,r){var e=t+"";return Ls(n,Wi(e,ro(Ii(e),r)))}function Qi(n){var t=0,r=0;return function(){var e=Jl(),u=In-(e-r);if(r=e,u>0){if(++t>=On)return arguments[0]}else t=0;
return n.apply(X,arguments)}}function Xi(n,t){var r=-1,e=n.length,u=e-1;for(t=t===X?e:t;++r<t;){var i=tu(r,u),o=n[i];n[i]=n[r],n[r]=o}return n.length=t,n}function no(n){if("string"==typeof n||bc(n))return n;var t=n+"";return"0"==t&&1/n==-Sn?"-0":t}function to(n){if(null!=n){try{return dl.call(n)}catch(n){}try{return n+""}catch(n){}}return""}function ro(n,t){return r($n,function(r){var e="_."+r[0];t&r[1]&&!o(n,e)&&n.push(e)}),n.sort()}function eo(n){if(n instanceof Ct)return n.clone();var t=new Y(n.__wrapped__,n.__chain__);
return t.__actions__=Tu(n.__actions__),t.__index__=n.__index__,t.__values__=n.__values__,t}function uo(n,t,r){t=(r?Ui(n,t,r):t===X)?1:Gl(kc(t),0);var e=null==n?0:n.length;if(!e||t<1)return[];for(var u=0,i=0,o=il(Fl(e/t));u<e;)o[i++]=au(n,u,u+=t);return o}function io(n){for(var t=-1,r=null==n?0:n.length,e=0,u=[];++t<r;){var i=n[t];i&&(u[e++]=i)}return u}function oo(){var n=arguments.length;if(!n)return[];for(var t=il(n-1),r=arguments[0],e=n;e--;)t[e-1]=arguments[e];return a(bh(r)?Tu(r):[r],ee(t,1));
}function fo(n,t,r){var e=null==n?0:n.length;return e?(t=r||t===X?1:kc(t),au(n,t<0?0:t,e)):[]}function co(n,t,r){var e=null==n?0:n.length;return e?(t=r||t===X?1:kc(t),t=e-t,au(n,0,t<0?0:t)):[]}function ao(n,t){return n&&n.length?bu(n,mi(t,3),!0,!0):[]}function lo(n,t){return n&&n.length?bu(n,mi(t,3),!0):[]}function so(n,t,r,e){var u=null==n?0:n.length;return u?(r&&"number"!=typeof r&&Ui(n,t,r)&&(r=0,e=u),ne(n,t,r,e)):[]}function ho(n,t,r){var e=null==n?0:n.length;if(!e)return-1;var u=null==r?0:kc(r);
return u<0&&(u=Gl(e+u,0)),g(n,mi(t,3),u)}function po(n,t,r){var e=null==n?0:n.length;if(!e)return-1;var u=e-1;return r!==X&&(u=kc(r),u=r<0?Gl(e+u,0):Hl(u,e-1)),g(n,mi(t,3),u,!0)}function _o(n){return(null==n?0:n.length)?ee(n,1):[]}function vo(n){return(null==n?0:n.length)?ee(n,Sn):[]}function go(n,t){return(null==n?0:n.length)?(t=t===X?1:kc(t),ee(n,t)):[]}function yo(n){for(var t=-1,r=null==n?0:n.length,e={};++t<r;){var u=n[t];e[u[0]]=u[1]}return e}function bo(n){return n&&n.length?n[0]:X}function wo(n,t,r){
var e=null==n?0:n.length;if(!e)return-1;var u=null==r?0:kc(r);return u<0&&(u=Gl(e+u,0)),y(n,t,u)}function mo(n){return(null==n?0:n.length)?au(n,0,-1):[]}function xo(n,t){return null==n?"":Kl.call(n,t)}function jo(n){var t=null==n?0:n.length;return t?n[t-1]:X}function Ao(n,t,r){var e=null==n?0:n.length;if(!e)return-1;var u=e;return r!==X&&(u=kc(r),u=u<0?Gl(e+u,0):Hl(u,e-1)),t===t?K(n,t,u):g(n,b,u,!0)}function ko(n,t){return n&&n.length?Ge(n,kc(t)):X}function Oo(n,t){return n&&n.length&&t&&t.length?Xe(n,t):n;
}function Io(n,t,r){return n&&n.length&&t&&t.length?Xe(n,t,mi(r,2)):n}function Ro(n,t,r){return n&&n.length&&t&&t.length?Xe(n,t,X,r):n}function zo(n,t){var r=[];if(!n||!n.length)return r;var e=-1,u=[],i=n.length;for(t=mi(t,3);++e<i;){var o=n[e];t(o,e,n)&&(r.push(o),u.push(e))}return nu(n,u),r}function Eo(n){return null==n?n:Xl.call(n)}function So(n,t,r){var e=null==n?0:n.length;return e?(r&&"number"!=typeof r&&Ui(n,t,r)?(t=0,r=e):(t=null==t?0:kc(t),r=r===X?e:kc(r)),au(n,t,r)):[]}function Wo(n,t){
return su(n,t)}function Lo(n,t,r){return hu(n,t,mi(r,2))}function Co(n,t){var r=null==n?0:n.length;if(r){var e=su(n,t);if(e<r&&Gf(n[e],t))return e}return-1}function Uo(n,t){return su(n,t,!0)}function Bo(n,t,r){return hu(n,t,mi(r,2),!0)}function To(n,t){if(null==n?0:n.length){var r=su(n,t,!0)-1;if(Gf(n[r],t))return r}return-1}function $o(n){return n&&n.length?pu(n):[]}function Do(n,t){return n&&n.length?pu(n,mi(t,2)):[]}function Mo(n){var t=null==n?0:n.length;return t?au(n,1,t):[]}function Fo(n,t,r){
return n&&n.length?(t=r||t===X?1:kc(t),au(n,0,t<0?0:t)):[]}function No(n,t,r){var e=null==n?0:n.length;return e?(t=r||t===X?1:kc(t),t=e-t,au(n,t<0?0:t,e)):[]}function Po(n,t){return n&&n.length?bu(n,mi(t,3),!1,!0):[]}function qo(n,t){return n&&n.length?bu(n,mi(t,3)):[]}function Zo(n){return n&&n.length?gu(n):[]}function Ko(n,t){return n&&n.length?gu(n,mi(t,2)):[]}function Vo(n,t){return t="function"==typeof t?t:X,n&&n.length?gu(n,X,t):[]}function Go(n){if(!n||!n.length)return[];var t=0;return n=i(n,function(n){
if(Jf(n))return t=Gl(n.length,t),!0}),O(t,function(t){return c(n,m(t))})}function Ho(t,r){if(!t||!t.length)return[];var e=Go(t);return null==r?e:c(e,function(t){return n(r,X,t)})}function Jo(n,t){return xu(n||[],t||[],Sr)}function Yo(n,t){return xu(n||[],t||[],fu)}function Qo(n){var t=Z(n);return t.__chain__=!0,t}function Xo(n,t){return t(n),n}function nf(n,t){return t(n)}function tf(){return Qo(this)}function rf(){return new Y(this.value(),this.__chain__)}function ef(){this.__values__===X&&(this.__values__=jc(this.value()));
var n=this.__index__>=this.__values__.length;return{done:n,value:n?X:this.__values__[this.__index__++]}}function uf(){return this}function of(n){for(var t,r=this;r instanceof J;){var e=eo(r);e.__index__=0,e.__values__=X,t?u.__wrapped__=e:t=e;var u=e;r=r.__wrapped__}return u.__wrapped__=n,t}function ff(){var n=this.__wrapped__;if(n instanceof Ct){var t=n;return this.__actions__.length&&(t=new Ct(this)),t=t.reverse(),t.__actions__.push({func:nf,args:[Eo],thisArg:X}),new Y(t,this.__chain__)}return this.thru(Eo);
}function cf(){return wu(this.__wrapped__,this.__actions__)}function af(n,t,r){var e=bh(n)?u:Jr;return r&&Ui(n,t,r)&&(t=X),e(n,mi(t,3))}function lf(n,t){return(bh(n)?i:te)(n,mi(t,3))}function sf(n,t){return ee(yf(n,t),1)}function hf(n,t){return ee(yf(n,t),Sn)}function pf(n,t,r){return r=r===X?1:kc(r),ee(yf(n,t),r)}function _f(n,t){return(bh(n)?r:ys)(n,mi(t,3))}function vf(n,t){return(bh(n)?e:ds)(n,mi(t,3))}function gf(n,t,r,e){n=Hf(n)?n:ra(n),r=r&&!e?kc(r):0;var u=n.length;return r<0&&(r=Gl(u+r,0)),
dc(n)?r<=u&&n.indexOf(t,r)>-1:!!u&&y(n,t,r)>-1}function yf(n,t){return(bh(n)?c:Pe)(n,mi(t,3))}function df(n,t,r,e){return null==n?[]:(bh(t)||(t=null==t?[]:[t]),r=e?X:r,bh(r)||(r=null==r?[]:[r]),He(n,t,r))}function bf(n,t,r){var e=bh(n)?l:j,u=arguments.length<3;return e(n,mi(t,4),r,u,ys)}function wf(n,t,r){var e=bh(n)?s:j,u=arguments.length<3;return e(n,mi(t,4),r,u,ds)}function mf(n,t){return(bh(n)?i:te)(n,Uf(mi(t,3)))}function xf(n){return(bh(n)?Ir:iu)(n)}function jf(n,t,r){return t=(r?Ui(n,t,r):t===X)?1:kc(t),
(bh(n)?Rr:ou)(n,t)}function Af(n){return(bh(n)?zr:cu)(n)}function kf(n){if(null==n)return 0;if(Hf(n))return dc(n)?V(n):n.length;var t=zs(n);return t==Gn||t==tt?n.size:Me(n).length}function Of(n,t,r){var e=bh(n)?h:lu;return r&&Ui(n,t,r)&&(t=X),e(n,mi(t,3))}function If(n,t){if("function"!=typeof t)throw new pl(en);return n=kc(n),function(){if(--n<1)return t.apply(this,arguments)}}function Rf(n,t,r){return t=r?X:t,t=n&&null==t?n.length:t,ai(n,mn,X,X,X,X,t)}function zf(n,t){var r;if("function"!=typeof t)throw new pl(en);
return n=kc(n),function(){return--n>0&&(r=t.apply(this,arguments)),n<=1&&(t=X),r}}function Ef(n,t,r){t=r?X:t;var e=ai(n,yn,X,X,X,X,X,t);return e.placeholder=Ef.placeholder,e}function Sf(n,t,r){t=r?X:t;var e=ai(n,dn,X,X,X,X,X,t);return e.placeholder=Sf.placeholder,e}function Wf(n,t,r){function e(t){var r=h,e=p;return h=p=X,d=t,v=n.apply(e,r)}function u(n){return d=n,g=Ws(f,t),b?e(n):v}function i(n){var r=n-y,e=n-d,u=t-r;return w?Hl(u,_-e):u}function o(n){var r=n-y,e=n-d;return y===X||r>=t||r<0||w&&e>=_;
}function f(){var n=fh();return o(n)?c(n):(g=Ws(f,i(n)),X)}function c(n){return g=X,m&&h?e(n):(h=p=X,v)}function a(){g!==X&&As(g),d=0,h=y=p=g=X}function l(){return g===X?v:c(fh())}function s(){var n=fh(),r=o(n);if(h=arguments,p=this,y=n,r){if(g===X)return u(y);if(w)return As(g),g=Ws(f,t),e(y)}return g===X&&(g=Ws(f,t)),v}var h,p,_,v,g,y,d=0,b=!1,w=!1,m=!0;if("function"!=typeof n)throw new pl(en);return t=Ic(t)||0,fc(r)&&(b=!!r.leading,w="maxWait"in r,_=w?Gl(Ic(r.maxWait)||0,t):_,m="trailing"in r?!!r.trailing:m),
s.cancel=a,s.flush=l,s}function Lf(n){return ai(n,jn)}function Cf(n,t){if("function"!=typeof n||null!=t&&"function"!=typeof t)throw new pl(en);var r=function(){var e=arguments,u=t?t.apply(this,e):e[0],i=r.cache;if(i.has(u))return i.get(u);var o=n.apply(this,e);return r.cache=i.set(u,o)||i,o};return r.cache=new(Cf.Cache||sr),r}function Uf(n){if("function"!=typeof n)throw new pl(en);return function(){var t=arguments;switch(t.length){case 0:return!n.call(this);case 1:return!n.call(this,t[0]);case 2:
return!n.call(this,t[0],t[1]);case 3:return!n.call(this,t[0],t[1],t[2])}return!n.apply(this,t)}}function Bf(n){return zf(2,n)}function Tf(n,t){if("function"!=typeof n)throw new pl(en);return t=t===X?t:kc(t),uu(n,t)}function $f(t,r){if("function"!=typeof t)throw new pl(en);return r=null==r?0:Gl(kc(r),0),uu(function(e){var u=e[r],i=Ou(e,0,r);return u&&a(i,u),n(t,this,i)})}function Df(n,t,r){var e=!0,u=!0;if("function"!=typeof n)throw new pl(en);return fc(r)&&(e="leading"in r?!!r.leading:e,u="trailing"in r?!!r.trailing:u),
Wf(n,t,{leading:e,maxWait:t,trailing:u})}function Mf(n){return Rf(n,1)}function Ff(n,t){return ph(Au(t),n)}function Nf(){if(!arguments.length)return[];var n=arguments[0];return bh(n)?n:[n]}function Pf(n){return Fr(n,sn)}function qf(n,t){return t="function"==typeof t?t:X,Fr(n,sn,t)}function Zf(n){return Fr(n,an|sn)}function Kf(n,t){return t="function"==typeof t?t:X,Fr(n,an|sn,t)}function Vf(n,t){return null==t||Pr(n,t,Pc(t))}function Gf(n,t){return n===t||n!==n&&t!==t}function Hf(n){return null!=n&&oc(n.length)&&!uc(n);
}function Jf(n){return cc(n)&&Hf(n)}function Yf(n){return n===!0||n===!1||cc(n)&&we(n)==Nn}function Qf(n){return cc(n)&&1===n.nodeType&&!gc(n)}function Xf(n){if(null==n)return!0;if(Hf(n)&&(bh(n)||"string"==typeof n||"function"==typeof n.splice||mh(n)||Oh(n)||dh(n)))return!n.length;var t=zs(n);if(t==Gn||t==tt)return!n.size;if(Mi(n))return!Me(n).length;for(var r in n)if(bl.call(n,r))return!1;return!0}function nc(n,t){return Se(n,t)}function tc(n,t,r){r="function"==typeof r?r:X;var e=r?r(n,t):X;return e===X?Se(n,t,X,r):!!e;
}function rc(n){if(!cc(n))return!1;var t=we(n);return t==Zn||t==qn||"string"==typeof n.message&&"string"==typeof n.name&&!gc(n)}function ec(n){return"number"==typeof n&&Zl(n)}function uc(n){if(!fc(n))return!1;var t=we(n);return t==Kn||t==Vn||t==Fn||t==Xn}function ic(n){return"number"==typeof n&&n==kc(n)}function oc(n){return"number"==typeof n&&n>-1&&n%1==0&&n<=Wn}function fc(n){var t=typeof n;return null!=n&&("object"==t||"function"==t)}function cc(n){return null!=n&&"object"==typeof n}function ac(n,t){
return n===t||Ce(n,t,ji(t))}function lc(n,t,r){return r="function"==typeof r?r:X,Ce(n,t,ji(t),r)}function sc(n){return vc(n)&&n!=+n}function hc(n){if(Es(n))throw new fl(rn);return Ue(n)}function pc(n){return null===n}function _c(n){return null==n}function vc(n){return"number"==typeof n||cc(n)&&we(n)==Hn}function gc(n){if(!cc(n)||we(n)!=Yn)return!1;var t=El(n);if(null===t)return!0;var r=bl.call(t,"constructor")&&t.constructor;return"function"==typeof r&&r instanceof r&&dl.call(r)==jl}function yc(n){
return ic(n)&&n>=-Wn&&n<=Wn}function dc(n){return"string"==typeof n||!bh(n)&&cc(n)&&we(n)==rt}function bc(n){return"symbol"==typeof n||cc(n)&&we(n)==et}function wc(n){return n===X}function mc(n){return cc(n)&&zs(n)==it}function xc(n){return cc(n)&&we(n)==ot}function jc(n){if(!n)return[];if(Hf(n))return dc(n)?G(n):Tu(n);if(Ul&&n[Ul])return D(n[Ul]());var t=zs(n);return(t==Gn?M:t==tt?P:ra)(n)}function Ac(n){if(!n)return 0===n?n:0;if(n=Ic(n),n===Sn||n===-Sn){return(n<0?-1:1)*Ln}return n===n?n:0}function kc(n){
var t=Ac(n),r=t%1;return t===t?r?t-r:t:0}function Oc(n){return n?Mr(kc(n),0,Un):0}function Ic(n){if("number"==typeof n)return n;if(bc(n))return Cn;if(fc(n)){var t="function"==typeof n.valueOf?n.valueOf():n;n=fc(t)?t+"":t}if("string"!=typeof n)return 0===n?n:+n;n=R(n);var r=qt.test(n);return r||Kt.test(n)?Xr(n.slice(2),r?2:8):Pt.test(n)?Cn:+n}function Rc(n){return $u(n,qc(n))}function zc(n){return n?Mr(kc(n),-Wn,Wn):0===n?n:0}function Ec(n){return null==n?"":vu(n)}function Sc(n,t){var r=gs(n);return null==t?r:Cr(r,t);
}function Wc(n,t){return v(n,mi(t,3),ue)}function Lc(n,t){return v(n,mi(t,3),oe)}function Cc(n,t){return null==n?n:bs(n,mi(t,3),qc)}function Uc(n,t){return null==n?n:ws(n,mi(t,3),qc)}function Bc(n,t){return n&&ue(n,mi(t,3))}function Tc(n,t){return n&&oe(n,mi(t,3))}function $c(n){return null==n?[]:fe(n,Pc(n))}function Dc(n){return null==n?[]:fe(n,qc(n))}function Mc(n,t,r){var e=null==n?X:_e(n,t);return e===X?r:e}function Fc(n,t){return null!=n&&Ri(n,t,xe)}function Nc(n,t){return null!=n&&Ri(n,t,je);
}function Pc(n){return Hf(n)?Or(n):Me(n)}function qc(n){return Hf(n)?Or(n,!0):Fe(n)}function Zc(n,t){var r={};return t=mi(t,3),ue(n,function(n,e,u){Br(r,t(n,e,u),n)}),r}function Kc(n,t){var r={};return t=mi(t,3),ue(n,function(n,e,u){Br(r,e,t(n,e,u))}),r}function Vc(n,t){return Gc(n,Uf(mi(t)))}function Gc(n,t){if(null==n)return{};var r=c(di(n),function(n){return[n]});return t=mi(t),Ye(n,r,function(n,r){return t(n,r[0])})}function Hc(n,t,r){t=ku(t,n);var e=-1,u=t.length;for(u||(u=1,n=X);++e<u;){var i=null==n?X:n[no(t[e])];
i===X&&(e=u,i=r),n=uc(i)?i.call(n):i}return n}function Jc(n,t,r){return null==n?n:fu(n,t,r)}function Yc(n,t,r,e){return e="function"==typeof e?e:X,null==n?n:fu(n,t,r,e)}function Qc(n,t,e){var u=bh(n),i=u||mh(n)||Oh(n);if(t=mi(t,4),null==e){var o=n&&n.constructor;e=i?u?new o:[]:fc(n)&&uc(o)?gs(El(n)):{}}return(i?r:ue)(n,function(n,r,u){return t(e,n,r,u)}),e}function Xc(n,t){return null==n||yu(n,t)}function na(n,t,r){return null==n?n:du(n,t,Au(r))}function ta(n,t,r,e){return e="function"==typeof e?e:X,
null==n?n:du(n,t,Au(r),e)}function ra(n){return null==n?[]:E(n,Pc(n))}function ea(n){return null==n?[]:E(n,qc(n))}function ua(n,t,r){return r===X&&(r=t,t=X),r!==X&&(r=Ic(r),r=r===r?r:0),t!==X&&(t=Ic(t),t=t===t?t:0),Mr(Ic(n),t,r)}function ia(n,t,r){return t=Ac(t),r===X?(r=t,t=0):r=Ac(r),n=Ic(n),Ae(n,t,r)}function oa(n,t,r){if(r&&"boolean"!=typeof r&&Ui(n,t,r)&&(t=r=X),r===X&&("boolean"==typeof t?(r=t,t=X):"boolean"==typeof n&&(r=n,n=X)),n===X&&t===X?(n=0,t=1):(n=Ac(n),t===X?(t=n,n=0):t=Ac(t)),n>t){
var e=n;n=t,t=e}if(r||n%1||t%1){var u=Ql();return Hl(n+u*(t-n+Qr("1e-"+((u+"").length-1))),t)}return tu(n,t)}function fa(n){return Qh(Ec(n).toLowerCase())}function ca(n){return n=Ec(n),n&&n.replace(Gt,ve).replace(Dr,"")}function aa(n,t,r){n=Ec(n),t=vu(t);var e=n.length;r=r===X?e:Mr(kc(r),0,e);var u=r;return r-=t.length,r>=0&&n.slice(r,u)==t}function la(n){return n=Ec(n),n&&At.test(n)?n.replace(xt,ge):n}function sa(n){return n=Ec(n),n&&Wt.test(n)?n.replace(St,"\\$&"):n}function ha(n,t,r){n=Ec(n),t=kc(t);
var e=t?V(n):0;if(!t||e>=t)return n;var u=(t-e)/2;return ri(Nl(u),r)+n+ri(Fl(u),r)}function pa(n,t,r){n=Ec(n),t=kc(t);var e=t?V(n):0;return t&&e<t?n+ri(t-e,r):n}function _a(n,t,r){n=Ec(n),t=kc(t);var e=t?V(n):0;return t&&e<t?ri(t-e,r)+n:n}function va(n,t,r){return r||null==t?t=0:t&&(t=+t),Yl(Ec(n).replace(Lt,""),t||0)}function ga(n,t,r){return t=(r?Ui(n,t,r):t===X)?1:kc(t),eu(Ec(n),t)}function ya(){var n=arguments,t=Ec(n[0]);return n.length<3?t:t.replace(n[1],n[2])}function da(n,t,r){return r&&"number"!=typeof r&&Ui(n,t,r)&&(t=r=X),
(r=r===X?Un:r>>>0)?(n=Ec(n),n&&("string"==typeof t||null!=t&&!Ah(t))&&(t=vu(t),!t&&T(n))?Ou(G(n),0,r):n.split(t,r)):[]}function ba(n,t,r){return n=Ec(n),r=null==r?0:Mr(kc(r),0,n.length),t=vu(t),n.slice(r,r+t.length)==t}function wa(n,t,r){var e=Z.templateSettings;r&&Ui(n,t,r)&&(t=X),n=Ec(n),t=Sh({},t,e,li);var u,i,o=Sh({},t.imports,e.imports,li),f=Pc(o),c=E(o,f),a=0,l=t.interpolate||Ht,s="__p += '",h=sl((t.escape||Ht).source+"|"+l.source+"|"+(l===It?Ft:Ht).source+"|"+(t.evaluate||Ht).source+"|$","g"),p="//# sourceURL="+(bl.call(t,"sourceURL")?(t.sourceURL+"").replace(/\s/g," "):"lodash.templateSources["+ ++Zr+"]")+"\n";
n.replace(h,function(t,r,e,o,f,c){return e||(e=o),s+=n.slice(a,c).replace(Jt,U),r&&(u=!0,s+="' +\n__e("+r+") +\n'"),f&&(i=!0,s+="';\n"+f+";\n__p += '"),e&&(s+="' +\n((__t = ("+e+")) == null ? '' : __t) +\n'"),a=c+t.length,t}),s+="';\n";var _=bl.call(t,"variable")&&t.variable;if(_){if(Dt.test(_))throw new fl(un)}else s="with (obj) {\n"+s+"\n}\n";s=(i?s.replace(dt,""):s).replace(bt,"$1").replace(wt,"$1;"),s="function("+(_||"obj")+") {\n"+(_?"":"obj || (obj = {});\n")+"var __t, __p = ''"+(u?", __e = _.escape":"")+(i?", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n":";\n")+s+"return __p\n}";
var v=Xh(function(){return cl(f,p+"return "+s).apply(X,c)});if(v.source=s,rc(v))throw v;return v}function ma(n){return Ec(n).toLowerCase()}function xa(n){return Ec(n).toUpperCase()}function ja(n,t,r){if(n=Ec(n),n&&(r||t===X))return R(n);if(!n||!(t=vu(t)))return n;var e=G(n),u=G(t);return Ou(e,W(e,u),L(e,u)+1).join("")}function Aa(n,t,r){if(n=Ec(n),n&&(r||t===X))return n.slice(0,H(n)+1);if(!n||!(t=vu(t)))return n;var e=G(n);return Ou(e,0,L(e,G(t))+1).join("")}function ka(n,t,r){if(n=Ec(n),n&&(r||t===X))return n.replace(Lt,"");
if(!n||!(t=vu(t)))return n;var e=G(n);return Ou(e,W(e,G(t))).join("")}function Oa(n,t){var r=An,e=kn;if(fc(t)){var u="separator"in t?t.separator:u;r="length"in t?kc(t.length):r,e="omission"in t?vu(t.omission):e}n=Ec(n);var i=n.length;if(T(n)){var o=G(n);i=o.length}if(r>=i)return n;var f=r-V(e);if(f<1)return e;var c=o?Ou(o,0,f).join(""):n.slice(0,f);if(u===X)return c+e;if(o&&(f+=c.length-f),Ah(u)){if(n.slice(f).search(u)){var a,l=c;for(u.global||(u=sl(u.source,Ec(Nt.exec(u))+"g")),u.lastIndex=0;a=u.exec(l);)var s=a.index;
c=c.slice(0,s===X?f:s)}}else if(n.indexOf(vu(u),f)!=f){var h=c.lastIndexOf(u);h>-1&&(c=c.slice(0,h))}return c+e}function Ia(n){return n=Ec(n),n&&jt.test(n)?n.replace(mt,ye):n}function Ra(n,t,r){return n=Ec(n),t=r?X:t,t===X?$(n)?Q(n):_(n):n.match(t)||[]}function za(t){var r=null==t?0:t.length,e=mi();return t=r?c(t,function(n){if("function"!=typeof n[1])throw new pl(en);return[e(n[0]),n[1]]}):[],uu(function(e){for(var u=-1;++u<r;){var i=t[u];if(n(i[0],this,e))return n(i[1],this,e)}})}function Ea(n){
return Nr(Fr(n,an))}function Sa(n){return function(){return n}}function Wa(n,t){return null==n||n!==n?t:n}function La(n){return n}function Ca(n){return De("function"==typeof n?n:Fr(n,an))}function Ua(n){return qe(Fr(n,an))}function Ba(n,t){return Ze(n,Fr(t,an))}function Ta(n,t,e){var u=Pc(t),i=fe(t,u);null!=e||fc(t)&&(i.length||!u.length)||(e=t,t=n,n=this,i=fe(t,Pc(t)));var o=!(fc(e)&&"chain"in e&&!e.chain),f=uc(n);return r(i,function(r){var e=t[r];n[r]=e,f&&(n.prototype[r]=function(){var t=this.__chain__;
if(o||t){var r=n(this.__wrapped__);return(r.__actions__=Tu(this.__actions__)).push({func:e,args:arguments,thisArg:n}),r.__chain__=t,r}return e.apply(n,a([this.value()],arguments))})}),n}function $a(){return re._===this&&(re._=Al),this}function Da(){}function Ma(n){return n=kc(n),uu(function(t){return Ge(t,n)})}function Fa(n){return Bi(n)?m(no(n)):Qe(n)}function Na(n){return function(t){return null==n?X:_e(n,t)}}function Pa(){return[]}function qa(){return!1}function Za(){return{}}function Ka(){return"";
}function Va(){return!0}function Ga(n,t){if(n=kc(n),n<1||n>Wn)return[];var r=Un,e=Hl(n,Un);t=mi(t),n-=Un;for(var u=O(e,t);++r<n;)t(r);return u}function Ha(n){return bh(n)?c(n,no):bc(n)?[n]:Tu(Cs(Ec(n)))}function Ja(n){var t=++wl;return Ec(n)+t}function Ya(n){return n&&n.length?Yr(n,La,me):X}function Qa(n,t){return n&&n.length?Yr(n,mi(t,2),me):X}function Xa(n){return w(n,La)}function nl(n,t){return w(n,mi(t,2))}function tl(n){return n&&n.length?Yr(n,La,Ne):X}function rl(n,t){return n&&n.length?Yr(n,mi(t,2),Ne):X;
}function el(n){return n&&n.length?k(n,La):0}function ul(n,t){return n&&n.length?k(n,mi(t,2)):0}x=null==x?re:be.defaults(re.Object(),x,be.pick(re,qr));var il=x.Array,ol=x.Date,fl=x.Error,cl=x.Function,al=x.Math,ll=x.Object,sl=x.RegExp,hl=x.String,pl=x.TypeError,_l=il.prototype,vl=cl.prototype,gl=ll.prototype,yl=x["__core-js_shared__"],dl=vl.toString,bl=gl.hasOwnProperty,wl=0,ml=function(){var n=/[^.]+$/.exec(yl&&yl.keys&&yl.keys.IE_PROTO||"");return n?"Symbol(src)_1."+n:""}(),xl=gl.toString,jl=dl.call(ll),Al=re._,kl=sl("^"+dl.call(bl).replace(St,"\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,"$1.*?")+"$"),Ol=ie?x.Buffer:X,Il=x.Symbol,Rl=x.Uint8Array,zl=Ol?Ol.allocUnsafe:X,El=F(ll.getPrototypeOf,ll),Sl=ll.create,Wl=gl.propertyIsEnumerable,Ll=_l.splice,Cl=Il?Il.isConcatSpreadable:X,Ul=Il?Il.iterator:X,Bl=Il?Il.toStringTag:X,Tl=function(){
try{var n=Ai(ll,"defineProperty");return n({},"",{}),n}catch(n){}}(),$l=x.clearTimeout!==re.clearTimeout&&x.clearTimeout,Dl=ol&&ol.now!==re.Date.now&&ol.now,Ml=x.setTimeout!==re.setTimeout&&x.setTimeout,Fl=al.ceil,Nl=al.floor,Pl=ll.getOwnPropertySymbols,ql=Ol?Ol.isBuffer:X,Zl=x.isFinite,Kl=_l.join,Vl=F(ll.keys,ll),Gl=al.max,Hl=al.min,Jl=ol.now,Yl=x.parseInt,Ql=al.random,Xl=_l.reverse,ns=Ai(x,"DataView"),ts=Ai(x,"Map"),rs=Ai(x,"Promise"),es=Ai(x,"Set"),us=Ai(x,"WeakMap"),is=Ai(ll,"create"),os=us&&new us,fs={},cs=to(ns),as=to(ts),ls=to(rs),ss=to(es),hs=to(us),ps=Il?Il.prototype:X,_s=ps?ps.valueOf:X,vs=ps?ps.toString:X,gs=function(){
function n(){}return function(t){if(!fc(t))return{};if(Sl)return Sl(t);n.prototype=t;var r=new n;return n.prototype=X,r}}();Z.templateSettings={escape:kt,evaluate:Ot,interpolate:It,variable:"",imports:{_:Z}},Z.prototype=J.prototype,Z.prototype.constructor=Z,Y.prototype=gs(J.prototype),Y.prototype.constructor=Y,Ct.prototype=gs(J.prototype),Ct.prototype.constructor=Ct,Xt.prototype.clear=nr,Xt.prototype.delete=tr,Xt.prototype.get=rr,Xt.prototype.has=er,Xt.prototype.set=ur,ir.prototype.clear=or,ir.prototype.delete=fr,
ir.prototype.get=cr,ir.prototype.has=ar,ir.prototype.set=lr,sr.prototype.clear=hr,sr.prototype.delete=pr,sr.prototype.get=_r,sr.prototype.has=vr,sr.prototype.set=gr,yr.prototype.add=yr.prototype.push=dr,yr.prototype.has=br,wr.prototype.clear=mr,wr.prototype.delete=xr,wr.prototype.get=jr,wr.prototype.has=Ar,wr.prototype.set=kr;var ys=Pu(ue),ds=Pu(oe,!0),bs=qu(),ws=qu(!0),ms=os?function(n,t){return os.set(n,t),n}:La,xs=Tl?function(n,t){return Tl(n,"toString",{configurable:!0,enumerable:!1,value:Sa(t),
writable:!0})}:La,js=uu,As=$l||function(n){return re.clearTimeout(n)},ks=es&&1/P(new es([,-0]))[1]==Sn?function(n){return new es(n)}:Da,Os=os?function(n){return os.get(n)}:Da,Is=Pl?function(n){return null==n?[]:(n=ll(n),i(Pl(n),function(t){return Wl.call(n,t)}))}:Pa,Rs=Pl?function(n){for(var t=[];n;)a(t,Is(n)),n=El(n);return t}:Pa,zs=we;(ns&&zs(new ns(new ArrayBuffer(1)))!=ct||ts&&zs(new ts)!=Gn||rs&&zs(rs.resolve())!=Qn||es&&zs(new es)!=tt||us&&zs(new us)!=it)&&(zs=function(n){var t=we(n),r=t==Yn?n.constructor:X,e=r?to(r):"";
if(e)switch(e){case cs:return ct;case as:return Gn;case ls:return Qn;case ss:return tt;case hs:return it}return t});var Es=yl?uc:qa,Ss=Qi(ms),Ws=Ml||function(n,t){return re.setTimeout(n,t)},Ls=Qi(xs),Cs=Pi(function(n){var t=[];return 46===n.charCodeAt(0)&&t.push(""),n.replace(Et,function(n,r,e,u){t.push(e?u.replace(Mt,"$1"):r||n)}),t}),Us=uu(function(n,t){return Jf(n)?Hr(n,ee(t,1,Jf,!0)):[]}),Bs=uu(function(n,t){var r=jo(t);return Jf(r)&&(r=X),Jf(n)?Hr(n,ee(t,1,Jf,!0),mi(r,2)):[]}),Ts=uu(function(n,t){
var r=jo(t);return Jf(r)&&(r=X),Jf(n)?Hr(n,ee(t,1,Jf,!0),X,r):[]}),$s=uu(function(n){var t=c(n,ju);return t.length&&t[0]===n[0]?ke(t):[]}),Ds=uu(function(n){var t=jo(n),r=c(n,ju);return t===jo(r)?t=X:r.pop(),r.length&&r[0]===n[0]?ke(r,mi(t,2)):[]}),Ms=uu(function(n){var t=jo(n),r=c(n,ju);return t="function"==typeof t?t:X,t&&r.pop(),r.length&&r[0]===n[0]?ke(r,X,t):[]}),Fs=uu(Oo),Ns=gi(function(n,t){var r=null==n?0:n.length,e=Tr(n,t);return nu(n,c(t,function(n){return Ci(n,r)?+n:n}).sort(Lu)),e}),Ps=uu(function(n){
return gu(ee(n,1,Jf,!0))}),qs=uu(function(n){var t=jo(n);return Jf(t)&&(t=X),gu(ee(n,1,Jf,!0),mi(t,2))}),Zs=uu(function(n){var t=jo(n);return t="function"==typeof t?t:X,gu(ee(n,1,Jf,!0),X,t)}),Ks=uu(function(n,t){return Jf(n)?Hr(n,t):[]}),Vs=uu(function(n){return mu(i(n,Jf))}),Gs=uu(function(n){var t=jo(n);return Jf(t)&&(t=X),mu(i(n,Jf),mi(t,2))}),Hs=uu(function(n){var t=jo(n);return t="function"==typeof t?t:X,mu(i(n,Jf),X,t)}),Js=uu(Go),Ys=uu(function(n){var t=n.length,r=t>1?n[t-1]:X;return r="function"==typeof r?(n.pop(),
r):X,Ho(n,r)}),Qs=gi(function(n){var t=n.length,r=t?n[0]:0,e=this.__wrapped__,u=function(t){return Tr(t,n)};return!(t>1||this.__actions__.length)&&e instanceof Ct&&Ci(r)?(e=e.slice(r,+r+(t?1:0)),e.__actions__.push({func:nf,args:[u],thisArg:X}),new Y(e,this.__chain__).thru(function(n){return t&&!n.length&&n.push(X),n})):this.thru(u)}),Xs=Fu(function(n,t,r){bl.call(n,r)?++n[r]:Br(n,r,1)}),nh=Ju(ho),th=Ju(po),rh=Fu(function(n,t,r){bl.call(n,r)?n[r].push(t):Br(n,r,[t])}),eh=uu(function(t,r,e){var u=-1,i="function"==typeof r,o=Hf(t)?il(t.length):[];
return ys(t,function(t){o[++u]=i?n(r,t,e):Ie(t,r,e)}),o}),uh=Fu(function(n,t,r){Br(n,r,t)}),ih=Fu(function(n,t,r){n[r?0:1].push(t)},function(){return[[],[]]}),oh=uu(function(n,t){if(null==n)return[];var r=t.length;return r>1&&Ui(n,t[0],t[1])?t=[]:r>2&&Ui(t[0],t[1],t[2])&&(t=[t[0]]),He(n,ee(t,1),[])}),fh=Dl||function(){return re.Date.now()},ch=uu(function(n,t,r){var e=_n;if(r.length){var u=N(r,wi(ch));e|=bn}return ai(n,e,t,r,u)}),ah=uu(function(n,t,r){var e=_n|vn;if(r.length){var u=N(r,wi(ah));e|=bn;
}return ai(t,e,n,r,u)}),lh=uu(function(n,t){return Gr(n,1,t)}),sh=uu(function(n,t,r){return Gr(n,Ic(t)||0,r)});Cf.Cache=sr;var hh=js(function(t,r){r=1==r.length&&bh(r[0])?c(r[0],z(mi())):c(ee(r,1),z(mi()));var e=r.length;return uu(function(u){for(var i=-1,o=Hl(u.length,e);++i<o;)u[i]=r[i].call(this,u[i]);return n(t,this,u)})}),ph=uu(function(n,t){return ai(n,bn,X,t,N(t,wi(ph)))}),_h=uu(function(n,t){return ai(n,wn,X,t,N(t,wi(_h)))}),vh=gi(function(n,t){return ai(n,xn,X,X,X,t)}),gh=ii(me),yh=ii(function(n,t){
return n>=t}),dh=Re(function(){return arguments}())?Re:function(n){return cc(n)&&bl.call(n,"callee")&&!Wl.call(n,"callee")},bh=il.isArray,wh=ce?z(ce):ze,mh=ql||qa,xh=ae?z(ae):Ee,jh=le?z(le):Le,Ah=se?z(se):Be,kh=he?z(he):Te,Oh=pe?z(pe):$e,Ih=ii(Ne),Rh=ii(function(n,t){return n<=t}),zh=Nu(function(n,t){if(Mi(t)||Hf(t))return $u(t,Pc(t),n),X;for(var r in t)bl.call(t,r)&&Sr(n,r,t[r])}),Eh=Nu(function(n,t){$u(t,qc(t),n)}),Sh=Nu(function(n,t,r,e){$u(t,qc(t),n,e)}),Wh=Nu(function(n,t,r,e){$u(t,Pc(t),n,e);
}),Lh=gi(Tr),Ch=uu(function(n,t){n=ll(n);var r=-1,e=t.length,u=e>2?t[2]:X;for(u&&Ui(t[0],t[1],u)&&(e=1);++r<e;)for(var i=t[r],o=qc(i),f=-1,c=o.length;++f<c;){var a=o[f],l=n[a];(l===X||Gf(l,gl[a])&&!bl.call(n,a))&&(n[a]=i[a])}return n}),Uh=uu(function(t){return t.push(X,si),n(Mh,X,t)}),Bh=Xu(function(n,t,r){null!=t&&"function"!=typeof t.toString&&(t=xl.call(t)),n[t]=r},Sa(La)),Th=Xu(function(n,t,r){null!=t&&"function"!=typeof t.toString&&(t=xl.call(t)),bl.call(n,t)?n[t].push(r):n[t]=[r]},mi),$h=uu(Ie),Dh=Nu(function(n,t,r){
Ke(n,t,r)}),Mh=Nu(function(n,t,r,e){Ke(n,t,r,e)}),Fh=gi(function(n,t){var r={};if(null==n)return r;var e=!1;t=c(t,function(t){return t=ku(t,n),e||(e=t.length>1),t}),$u(n,di(n),r),e&&(r=Fr(r,an|ln|sn,hi));for(var u=t.length;u--;)yu(r,t[u]);return r}),Nh=gi(function(n,t){return null==n?{}:Je(n,t)}),Ph=ci(Pc),qh=ci(qc),Zh=Vu(function(n,t,r){return t=t.toLowerCase(),n+(r?fa(t):t)}),Kh=Vu(function(n,t,r){return n+(r?"-":"")+t.toLowerCase()}),Vh=Vu(function(n,t,r){return n+(r?" ":"")+t.toLowerCase()}),Gh=Ku("toLowerCase"),Hh=Vu(function(n,t,r){
return n+(r?"_":"")+t.toLowerCase()}),Jh=Vu(function(n,t,r){return n+(r?" ":"")+Qh(t)}),Yh=Vu(function(n,t,r){return n+(r?" ":"")+t.toUpperCase()}),Qh=Ku("toUpperCase"),Xh=uu(function(t,r){try{return n(t,X,r)}catch(n){return rc(n)?n:new fl(n)}}),np=gi(function(n,t){return r(t,function(t){t=no(t),Br(n,t,ch(n[t],n))}),n}),tp=Yu(),rp=Yu(!0),ep=uu(function(n,t){return function(r){return Ie(r,n,t)}}),up=uu(function(n,t){return function(r){return Ie(n,r,t)}}),ip=ti(c),op=ti(u),fp=ti(h),cp=ui(),ap=ui(!0),lp=ni(function(n,t){
return n+t},0),sp=fi("ceil"),hp=ni(function(n,t){return n/t},1),pp=fi("floor"),_p=ni(function(n,t){return n*t},1),vp=fi("round"),gp=ni(function(n,t){return n-t},0);return Z.after=If,Z.ary=Rf,Z.assign=zh,Z.assignIn=Eh,Z.assignInWith=Sh,Z.assignWith=Wh,Z.at=Lh,Z.before=zf,Z.bind=ch,Z.bindAll=np,Z.bindKey=ah,Z.castArray=Nf,Z.chain=Qo,Z.chunk=uo,Z.compact=io,Z.concat=oo,Z.cond=za,Z.conforms=Ea,Z.constant=Sa,Z.countBy=Xs,Z.create=Sc,Z.curry=Ef,Z.curryRight=Sf,Z.debounce=Wf,Z.defaults=Ch,Z.defaultsDeep=Uh,
Z.defer=lh,Z.delay=sh,Z.difference=Us,Z.differenceBy=Bs,Z.differenceWith=Ts,Z.drop=fo,Z.dropRight=co,Z.dropRightWhile=ao,Z.dropWhile=lo,Z.fill=so,Z.filter=lf,Z.flatMap=sf,Z.flatMapDeep=hf,Z.flatMapDepth=pf,Z.flatten=_o,Z.flattenDeep=vo,Z.flattenDepth=go,Z.flip=Lf,Z.flow=tp,Z.flowRight=rp,Z.fromPairs=yo,Z.functions=$c,Z.functionsIn=Dc,Z.groupBy=rh,Z.initial=mo,Z.intersection=$s,Z.intersectionBy=Ds,Z.intersectionWith=Ms,Z.invert=Bh,Z.invertBy=Th,Z.invokeMap=eh,Z.iteratee=Ca,Z.keyBy=uh,Z.keys=Pc,Z.keysIn=qc,
Z.map=yf,Z.mapKeys=Zc,Z.mapValues=Kc,Z.matches=Ua,Z.matchesProperty=Ba,Z.memoize=Cf,Z.merge=Dh,Z.mergeWith=Mh,Z.method=ep,Z.methodOf=up,Z.mixin=Ta,Z.negate=Uf,Z.nthArg=Ma,Z.omit=Fh,Z.omitBy=Vc,Z.once=Bf,Z.orderBy=df,Z.over=ip,Z.overArgs=hh,Z.overEvery=op,Z.overSome=fp,Z.partial=ph,Z.partialRight=_h,Z.partition=ih,Z.pick=Nh,Z.pickBy=Gc,Z.property=Fa,Z.propertyOf=Na,Z.pull=Fs,Z.pullAll=Oo,Z.pullAllBy=Io,Z.pullAllWith=Ro,Z.pullAt=Ns,Z.range=cp,Z.rangeRight=ap,Z.rearg=vh,Z.reject=mf,Z.remove=zo,Z.rest=Tf,
Z.reverse=Eo,Z.sampleSize=jf,Z.set=Jc,Z.setWith=Yc,Z.shuffle=Af,Z.slice=So,Z.sortBy=oh,Z.sortedUniq=$o,Z.sortedUniqBy=Do,Z.split=da,Z.spread=$f,Z.tail=Mo,Z.take=Fo,Z.takeRight=No,Z.takeRightWhile=Po,Z.takeWhile=qo,Z.tap=Xo,Z.throttle=Df,Z.thru=nf,Z.toArray=jc,Z.toPairs=Ph,Z.toPairsIn=qh,Z.toPath=Ha,Z.toPlainObject=Rc,Z.transform=Qc,Z.unary=Mf,Z.union=Ps,Z.unionBy=qs,Z.unionWith=Zs,Z.uniq=Zo,Z.uniqBy=Ko,Z.uniqWith=Vo,Z.unset=Xc,Z.unzip=Go,Z.unzipWith=Ho,Z.update=na,Z.updateWith=ta,Z.values=ra,Z.valuesIn=ea,
Z.without=Ks,Z.words=Ra,Z.wrap=Ff,Z.xor=Vs,Z.xorBy=Gs,Z.xorWith=Hs,Z.zip=Js,Z.zipObject=Jo,Z.zipObjectDeep=Yo,Z.zipWith=Ys,Z.entries=Ph,Z.entriesIn=qh,Z.extend=Eh,Z.extendWith=Sh,Ta(Z,Z),Z.add=lp,Z.attempt=Xh,Z.camelCase=Zh,Z.capitalize=fa,Z.ceil=sp,Z.clamp=ua,Z.clone=Pf,Z.cloneDeep=Zf,Z.cloneDeepWith=Kf,Z.cloneWith=qf,Z.conformsTo=Vf,Z.deburr=ca,Z.defaultTo=Wa,Z.divide=hp,Z.endsWith=aa,Z.eq=Gf,Z.escape=la,Z.escapeRegExp=sa,Z.every=af,Z.find=nh,Z.findIndex=ho,Z.findKey=Wc,Z.findLast=th,Z.findLastIndex=po,
Z.findLastKey=Lc,Z.floor=pp,Z.forEach=_f,Z.forEachRight=vf,Z.forIn=Cc,Z.forInRight=Uc,Z.forOwn=Bc,Z.forOwnRight=Tc,Z.get=Mc,Z.gt=gh,Z.gte=yh,Z.has=Fc,Z.hasIn=Nc,Z.head=bo,Z.identity=La,Z.includes=gf,Z.indexOf=wo,Z.inRange=ia,Z.invoke=$h,Z.isArguments=dh,Z.isArray=bh,Z.isArrayBuffer=wh,Z.isArrayLike=Hf,Z.isArrayLikeObject=Jf,Z.isBoolean=Yf,Z.isBuffer=mh,Z.isDate=xh,Z.isElement=Qf,Z.isEmpty=Xf,Z.isEqual=nc,Z.isEqualWith=tc,Z.isError=rc,Z.isFinite=ec,Z.isFunction=uc,Z.isInteger=ic,Z.isLength=oc,Z.isMap=jh,
Z.isMatch=ac,Z.isMatchWith=lc,Z.isNaN=sc,Z.isNative=hc,Z.isNil=_c,Z.isNull=pc,Z.isNumber=vc,Z.isObject=fc,Z.isObjectLike=cc,Z.isPlainObject=gc,Z.isRegExp=Ah,Z.isSafeInteger=yc,Z.isSet=kh,Z.isString=dc,Z.isSymbol=bc,Z.isTypedArray=Oh,Z.isUndefined=wc,Z.isWeakMap=mc,Z.isWeakSet=xc,Z.join=xo,Z.kebabCase=Kh,Z.last=jo,Z.lastIndexOf=Ao,Z.lowerCase=Vh,Z.lowerFirst=Gh,Z.lt=Ih,Z.lte=Rh,Z.max=Ya,Z.maxBy=Qa,Z.mean=Xa,Z.meanBy=nl,Z.min=tl,Z.minBy=rl,Z.stubArray=Pa,Z.stubFalse=qa,Z.stubObject=Za,Z.stubString=Ka,
Z.stubTrue=Va,Z.multiply=_p,Z.nth=ko,Z.noConflict=$a,Z.noop=Da,Z.now=fh,Z.pad=ha,Z.padEnd=pa,Z.padStart=_a,Z.parseInt=va,Z.random=oa,Z.reduce=bf,Z.reduceRight=wf,Z.repeat=ga,Z.replace=ya,Z.result=Hc,Z.round=vp,Z.runInContext=p,Z.sample=xf,Z.size=kf,Z.snakeCase=Hh,Z.some=Of,Z.sortedIndex=Wo,Z.sortedIndexBy=Lo,Z.sortedIndexOf=Co,Z.sortedLastIndex=Uo,Z.sortedLastIndexBy=Bo,Z.sortedLastIndexOf=To,Z.startCase=Jh,Z.startsWith=ba,Z.subtract=gp,Z.sum=el,Z.sumBy=ul,Z.template=wa,Z.times=Ga,Z.toFinite=Ac,Z.toInteger=kc,
Z.toLength=Oc,Z.toLower=ma,Z.toNumber=Ic,Z.toSafeInteger=zc,Z.toString=Ec,Z.toUpper=xa,Z.trim=ja,Z.trimEnd=Aa,Z.trimStart=ka,Z.truncate=Oa,Z.unescape=Ia,Z.uniqueId=Ja,Z.upperCase=Yh,Z.upperFirst=Qh,Z.each=_f,Z.eachRight=vf,Z.first=bo,Ta(Z,function(){var n={};return ue(Z,function(t,r){bl.call(Z.prototype,r)||(n[r]=t)}),n}(),{chain:!1}),Z.VERSION=nn,r(["bind","bindKey","curry","curryRight","partial","partialRight"],function(n){Z[n].placeholder=Z}),r(["drop","take"],function(n,t){Ct.prototype[n]=function(r){
r=r===X?1:Gl(kc(r),0);var e=this.__filtered__&&!t?new Ct(this):this.clone();return e.__filtered__?e.__takeCount__=Hl(r,e.__takeCount__):e.__views__.push({size:Hl(r,Un),type:n+(e.__dir__<0?"Right":"")}),e},Ct.prototype[n+"Right"]=function(t){return this.reverse()[n](t).reverse()}}),r(["filter","map","takeWhile"],function(n,t){var r=t+1,e=r==Rn||r==En;Ct.prototype[n]=function(n){var t=this.clone();return t.__iteratees__.push({iteratee:mi(n,3),type:r}),t.__filtered__=t.__filtered__||e,t}}),r(["head","last"],function(n,t){
var r="take"+(t?"Right":"");Ct.prototype[n]=function(){return this[r](1).value()[0]}}),r(["initial","tail"],function(n,t){var r="drop"+(t?"":"Right");Ct.prototype[n]=function(){return this.__filtered__?new Ct(this):this[r](1)}}),Ct.prototype.compact=function(){return this.filter(La)},Ct.prototype.find=function(n){return this.filter(n).head()},Ct.prototype.findLast=function(n){return this.reverse().find(n)},Ct.prototype.invokeMap=uu(function(n,t){return"function"==typeof n?new Ct(this):this.map(function(r){
return Ie(r,n,t)})}),Ct.prototype.reject=function(n){return this.filter(Uf(mi(n)))},Ct.prototype.slice=function(n,t){n=kc(n);var r=this;return r.__filtered__&&(n>0||t<0)?new Ct(r):(n<0?r=r.takeRight(-n):n&&(r=r.drop(n)),t!==X&&(t=kc(t),r=t<0?r.dropRight(-t):r.take(t-n)),r)},Ct.prototype.takeRightWhile=function(n){return this.reverse().takeWhile(n).reverse()},Ct.prototype.toArray=function(){return this.take(Un)},ue(Ct.prototype,function(n,t){var r=/^(?:filter|find|map|reject)|While$/.test(t),e=/^(?:head|last)$/.test(t),u=Z[e?"take"+("last"==t?"Right":""):t],i=e||/^find/.test(t);
u&&(Z.prototype[t]=function(){var t=this.__wrapped__,o=e?[1]:arguments,f=t instanceof Ct,c=o[0],l=f||bh(t),s=function(n){var t=u.apply(Z,a([n],o));return e&&h?t[0]:t};l&&r&&"function"==typeof c&&1!=c.length&&(f=l=!1);var h=this.__chain__,p=!!this.__actions__.length,_=i&&!h,v=f&&!p;if(!i&&l){t=v?t:new Ct(this);var g=n.apply(t,o);return g.__actions__.push({func:nf,args:[s],thisArg:X}),new Y(g,h)}return _&&v?n.apply(this,o):(g=this.thru(s),_?e?g.value()[0]:g.value():g)})}),r(["pop","push","shift","sort","splice","unshift"],function(n){
var t=_l[n],r=/^(?:push|sort|unshift)$/.test(n)?"tap":"thru",e=/^(?:pop|shift)$/.test(n);Z.prototype[n]=function(){var n=arguments;if(e&&!this.__chain__){var u=this.value();return t.apply(bh(u)?u:[],n)}return this[r](function(r){return t.apply(bh(r)?r:[],n)})}}),ue(Ct.prototype,function(n,t){var r=Z[t];if(r){var e=r.name+"";bl.call(fs,e)||(fs[e]=[]),fs[e].push({name:t,func:r})}}),fs[Qu(X,vn).name]=[{name:"wrapper",func:X}],Ct.prototype.clone=$t,Ct.prototype.reverse=Yt,Ct.prototype.value=Qt,Z.prototype.at=Qs,
Z.prototype.chain=tf,Z.prototype.commit=rf,Z.prototype.next=ef,Z.prototype.plant=of,Z.prototype.reverse=ff,Z.prototype.toJSON=Z.prototype.valueOf=Z.prototype.value=cf,Z.prototype.first=Z.prototype.head,Ul&&(Z.prototype[Ul]=uf),Z},be=de();"function"==typeof define&&"object"==typeof define.amd&&define.amd?(re._=be,define(function(){return be})):ue?((ue.exports=be)._=be,ee._=be):re._=be}).call(this);
