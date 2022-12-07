{% include components/charts/annotation_presets.js %}
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
                            re.push(line.slice(0, -1) + ': ' + alterDataDisplay(tooltipItem.formattedValue, tooltipItem.dataset, 'chart tooltip'));
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
            if (!annotation.scaleID && annotation.type === 'line' && annotation.preset !== 'error_bar') {
                if (annotation.mode === 'horizontal') {
                    annotation.scaleID = 'y';
                }
                if (annotation.mode === 'vertical') {
                    annotation.scaleID = 'x';
                }
            }
            if (!annotation.xScaleID && annotation.type === 'box') {
                annotation.xScaleID = 'x';
            }
            if (!annotation.yScaleID && annotation.type === 'box') {
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
