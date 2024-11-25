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
function toCsv(tableData, selectedSeries, selectedUnit) {
    var lines = [],
        dataHeadings = _.map(tableData.headings, function (heading) { return '"' + translations.t(heading) + '"'; }),
        metaHeadings = [];

    if (selectedSeries) {
        metaHeadings.push(translations.indicator.series);
    }
    if (selectedUnit) {
        metaHeadings.push(translations.indicator.unit);
    }
    var allHeadings = dataHeadings.concat(metaHeadings);

    lines.push(allHeadings.join(','));

    _.each(tableData.data, function (dataValues) {
        var line = [];

        _.each(dataHeadings, function (heading, index) {
            line.push(dataValues[index]);
        });
        if (selectedSeries) {
            line.push(JSON.stringify(translations.t(selectedSeries)));
        }
        if (selectedUnit) {
            line.push(JSON.stringify(translations.t(selectedUnit)));
        }

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
                    var additionalInfo = Object.assign({}, info);
                    additionalInfo.row = row;
                    additionalInfo.col = col;
                    $(td).text(alterDataDisplay(cellData, rowData, 'table cell', additionalInfo));
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
    createTable(chartInfo.selectionsTable, chartInfo.indicatorId, '#selectionsTable', chartInfo.isProxy, chartInfo.observationAttributesTable);
    $('#tableSelectionDownload').empty();
    createTableTargetLines(chartInfo.graphAnnotations);
    createDownloadButton(chartInfo.selectionsTable, 'Table', chartInfo.indicatorId, '#tableSelectionDownload', chartInfo.selectedSeries, chartInfo.selectedUnit);
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
 * @param {bool} isProxy
 * @param {Object} observationAttributesTable
 * @return null
 */
function createTable(table, indicatorId, el, isProxy, observationAttributesTable) {

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
        var row = -1;

        table.data.forEach(function (data) {
            row += 1;
            var col = -1;
            var row_html = '<tr>';
            var obsValue = '';
            console.log("observationAttributesTable: ", observationAttributesTable);
            //(observationAttributesTable.data[row][1][0] !== undefined ? obsValue = observationAttributesTable.data[row][1][0].value : obsValue = '.');
            table.headings.forEach(function (heading, index) {
                col += 1;
                // For accessibility set the Year column to a "row" scope th.
                // No observation values for years
                if (col == 0) {
                  obsValue = ''
                }
                // case: no obs attributes defined --> '' if we have a value and '.' if not
                else if (observationAttributesTable.data[row][col].length == 0) {
                  (data[index] !== null && data[index] !== undefined ?  obsValue = '' : obsValue = '.')
                }
                // case: Obs values are defined --> adding up all obs values separated by comma
                else {
                  obsValue = '';
                  for (var i = 0; i <  observationAttributesTable.data[row][col].length; i++) {
                    obsValue += (i == 0 ? observationAttributesTable.data[row][col][i].value : (', ' + observationAttributesTable.data[row][col][i].value));
                  };
                }
                //(observationAttributesTable.data[row][1][0] !== undefined ? obsValue = observationAttributesTable.data[row][1][0].value : obsValue = '.');
                var isYear = (index == 0);
                var cell_prefix = (isYear) ? '<th scope="row"' : '<td';
                var cell_suffix = (isYear) ? '</th>' : '</td>';

                //var dateForTable = (data[index] == 0 && obsValue.indexOf('‒') > -1) ? ('‒' + obsValue.replace('‒, ','').replace(', ‒','').replace('[‒]','')) : (data[index] + ' ' + obsValue);
                //var dateForTable = (data[index] == 0 && obsValue.indexOf('0') > -1) ? ('0' + obsValue.replace('0, ','').replace(', 0','').replace('[0]','')) : (data[index] + ' ' + obsValue);
                // case: datapoint == 0 --> we do not want 0 plus obsValue in tabel but only 0 (or 0.00) or - feventually ollowed by other obs values
                var dateForTable = ''
                if (data[index] == 0){
                  // case: only one obs-value (0 or -) --> show only the obs-value instead of the value
                  if (obsValue.length == 1){
                    dateForTable = obsValue;
                  }
                  // case: more than one obs-value --> setting the value to 0 or - and replace it in the obs-value by ''
                  else{
                    if (obsValue.indexOf('‒') > -1){
                      dateForTable = '‒ [' + obsValue.replace('‒, ','').replace(', ‒','') + ']';
                    }
                    else{
                      var deci = ['0', '0.0', '0.00', '0.000']
                      for (var i = 0; i < deci.length; i++) {
                        dateForTable = data[index] + ' [' + obsValue.replace('' + deci[i] + ', ','').replace(', ' + deci[i] + '','') + ']';
                      }
                      //dateForTable = data[index] + ' [' + obsValue.replace('0, ','').replace(', 0','') + ']';
                    }
                  }
                }
                // case: datapoint is not zero --> datapoint plus obs-value
                else {
                  dateForTable = (data[index] + ' ' + obsValue);
                }

                //var cell_content = (isYear) ? translations.t(data[index]) : data[index];
                //row_html += cell_prefix + (isYear ? '' : ' class="table-value"') + '>' + (cell_content !== null &&  cell_content !== undefined ?  cell_content : '.') + cell_suffix;
                //row_html += cell_prefix + (isYear ? '' : ' class="table-value"') + '>' + (data[index] !== null && data[index] !== undefined ?  (data[index] + ' ' + obsValue) : obsValue) + cell_suffix;
                row_html += cell_prefix + (isYear ? '' : ' class="table-value"') + '>' + (data[index] !== null && data[index] !== undefined ?  dateForTable : obsValue) + cell_suffix;
            });
            row_html += '</tr>';
            currentTable.find('tbody').append(row_html);
        });

        $(el).append(currentTable);

        // initialise data table and provide some info for alterations.
        var alterationInfo = {
            table: table,
            indicatorId: indicatorId,
            observationAttributesTable: observationAttributesTable,
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

        let tableWrapper = document.querySelector('.dataTables_wrapper');
        if (tableWrapper) {
            tableWrapper.addEventListener('scroll', function(e) {
                if (tableWrapper.scrollLeft > 0) {
                    tableWrapper.classList.add('scrolled-x');
                }
                else {
                    tableWrapper.classList.remove('scrolled-x');
                }
                if (tableWrapper.scrollTop > 0) {
                    tableWrapper.classList.add('scrolled-y');
                }
                else {
                    tableWrapper.classList.remove('scrolled-y');
                }
            });
        }
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
function updateChartDownloadButton(table, selectedSeries, selectedUnit) {
    if (typeof VIEW._chartDownloadButton !== 'undefined') {
        var tableCsv = toCsv(table, selectedSeries, selectedUnit);
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
