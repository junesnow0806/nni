import React, { useState, useEffect } from 'react';
import { DefaultButton, IColumn, Icon, PrimaryButton, Stack, StackItem, Checkbox } from '@fluentui/react';
import { Trial } from '@model/trial';
import { EXPERIMENT, TRIALS } from '@static/datamodel';
import { convertDuration, formatTimestamp, copyAndSort, parametersType, _inferColumnTitle } from '@static/function';
import { SortInfo, SearchItems } from '@static/interface';
import { blocked, copy, LineChart, tableListIcon } from '@components/fluent/Icon';
import Customize from './tableFunction/CustomizedTrial';
import TensorboardUI from './tableFunction/tensorboard/TensorboardUI';
import Search from './tableFunction/search/Search';
import ExpandableDetails from '@components/common/ExpandableDetails/ExpandableIndex';
import ChangeColumnComponent from '../ChangeColumnComponent';
import Compare from './tableFunction/CompareIndex';
import KillJobIndex from './tableFunction/killJob/KillJobIndex';
import { getTrialsBySearchFilters } from './tableFunction/search/searchFunction';
import PaginationTable from '@components/common/PaginationTable';
import CopyButton from '@components/common/CopyButton';
import TooltipHostIndex from '@components/common/TooltipHostIndex';
import { getValue } from '@model/localStorage';

require('echarts/lib/chart/line');
require('echarts/lib/component/tooltip');
require('echarts/lib/component/title');

const defaultDisplayedColumns = ['sequenceId', 'id', 'duration', 'status', 'latestAccuracy'];

interface TableListProps {
    tableSource: Trial[];
}

// interface TableListState {
//     displayedItems: any[];
//     displayedColumns: string[];
//     columns: IColumn[];
//     searchType: SearchOptionType;
//     searchText: string;
//     selectedRowIds: string[];
//     customizeColumnsDialogVisible: boolean;
//     compareDialogVisible: boolean;
//     intermediateDialogTrial: Trial[] | undefined;
//     copiedTrialId: string | undefined;
//     sortInfo: SortInfo;
//     searchItems: Array<SearchItems>;
//     relation: Map<string, string>;
// }

function TableList(props: TableListProps): any {
    const { tableSource } = props;
    // 通篇的类型跟之前的PR做对比
    const [displayedItems, setDisplayedItems] = useState([] as any);
    const [displayedColumns, setDisplayedColumns] = useState(
        localStorage.getItem(`${EXPERIMENT.profile.id}_columns`) !== null &&
            getValue(`${EXPERIMENT.profile.id}_columns`) !== null
            ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              JSON.parse(getValue(`${EXPERIMENT.profile.id}_columns`)!)
            : defaultDisplayedColumns
    );
    const [columns, setColumns] = useState([] as IColumn[]);
    const [customizeColumnsDialogVisible, setCustomizeColumnsDialogVisible] = useState(false);
    const [compareDialogVisible, setCompareDialogVisible] = useState(false);
    const [selectedRowIds, setSelectedRowIds] = useState([] as string[]);
    // const [intermediateDialogTrial, setIntermediateDialogTrial] = useState(undefined as Trial[]); // 类型不好写
    const [intermediateDialogTrial, setIntermediateDialogTrial] = useState([] as Trial[]); // 类型不好写
    const [copiedTrialId, setCopiedTrialId] = useState(undefined);
    const [sortInfo, setSortInfo] = useState({ field: '', isDescend: true } as SortInfo);
    const [searchItems, setSearchItems] = useState([] as SearchItems[]);
    const relation = parametersType();
    // const [relation, setRelation] = useState(parametersType());
    // relation 在旧版本中是不是没用到再次声明，只一次
    const _expandedTrialIds = new Set<string>();

    /* Table basic function related methods */

    const _onColumnClick = (ev: React.MouseEvent<HTMLElement>, column: IColumn): void => {
        // handle the click events on table header (do sorting)
        const newColumns: IColumn[] = columns.slice();
        const currColumn: IColumn = newColumns.filter(currCol => column.key === currCol.key)[0];
        const isSortedDescending = !currColumn.isSortedDescending;
        setSortInfo({ field: column.key, isDescend: isSortedDescending }); // 测试是否正常
    };

    const _trialsToTableItems = (trials: Trial[]): any[] => {
        // TODO: use search space and metrics space from TRIALS will cause update issues.
        const searchSpace = TRIALS.inferredSearchSpace(EXPERIMENT.searchSpaceNew);
        const metricSpace = TRIALS.inferredMetricSpace();
        const items = trials.map(trial => {
            const ret = trial.tableRecord;
            ret['_checked'] = selectedRowIds.includes(trial.id) ? true : false;
            ret['_expandDetails'] = _expandedTrialIds.has(trial.id); // hidden field names should start with `_`
            for (const [k, v] of trial.parameters(searchSpace)) {
                ret[`space/${k.baseName}`] = v;
            }
            for (const [k, v] of trial.metrics(metricSpace)) {
                ret[`metric/${k.baseName}`] = v;
            }
            return ret;
        });

        if (sortInfo.field !== '') {
            return copyAndSort(items, sortInfo.field, sortInfo.isDescend);
        } else {
            return items;
        }
    };

    const changeSelectTrialIds = (): void => {
        const newDisplayedItems = displayedItems;
        newDisplayedItems.forEach(item => {
            item._checked = false;
        });
        setSelectedRowIds([]);
        setDisplayedColumns(newDisplayedItems);
    };

    const _renderOperationColumn = (record: any): React.ReactNode => {
        const runningTrial: boolean = ['RUNNING', 'UNKNOWN'].includes(record.status) ? false : true;
        const disabledAddCustomizedTrial = ['DONE', 'ERROR', 'STOPPED', 'VIEWED'].includes(EXPERIMENT.status);
        return (
            <Stack className='detail-button' horizontal>
                <PrimaryButton
                    className='detail-button-operation'
                    title='Intermediate'
                    onClick={(): void => {
                        const trial = tableSource.find(trial => trial.id === record.id) as Trial;
                        setIntermediateDialogTrial([trial]);
                    }}
                >
                    {LineChart}
                </PrimaryButton>
                {runningTrial ? (
                    <PrimaryButton className='detail-button-operation' disabled={true} title='kill'>
                        {blocked}
                    </PrimaryButton>
                ) : (
                    <KillJobIndex trialId={record.id} />
                )}
                <PrimaryButton
                    className='detail-button-operation'
                    title='Customized trial'
                    onClick={(): void => {
                        setCopiedTrialId(record.id);
                    }}
                    disabled={disabledAddCustomizedTrial}
                >
                    {copy}
                </PrimaryButton>
            </Stack>
        );
    };

    const _buildColumnsFromTableItems = (tableItems: any[]): IColumn[] => {
        const columns: IColumn[] = [
            // select trial function
            {
                name: '',
                key: '_selected',
                fieldName: 'selected',
                minWidth: 20,
                maxWidth: 20,
                isResizable: true,
                className: 'detail-table',
                onRender: (record): React.ReactNode => (
                    <Checkbox
                        label={undefined}
                        checked={record._checked}
                        className='detail-check'
                        // onChange={this.selectedTrialOnChangeEvent.bind(this, record.id)}
                        onChange={(_ev?: React.FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean): void => {
                            const latestDisplayedItems = JSON.parse(JSON.stringify(displayedItems));
                            let latestSelectedRowIds = selectedRowIds;

                            if (checked === false) {
                                latestSelectedRowIds = latestSelectedRowIds.filter(item => item !== record.id);
                            } else {
                                latestSelectedRowIds.push(record.id);
                            }

                            latestDisplayedItems.forEach(item => {
                                if (item.id === record.id) {
                                    item._checked = !!checked;
                                }
                            });
                            setDisplayedItems(latestDisplayedItems);
                            setSelectedRowIds(latestSelectedRowIds);
                        }}
                    />
                )
            },
            // extra column, for a icon to expand the trial details panel
            {
                key: '_expand',
                name: '',
                onRender: (item): any => {
                    return (
                        <Icon
                            aria-hidden={true}
                            iconName='ChevronRight'
                            className='cursor bold positionTop'
                            styles={{
                                root: {
                                    transition: 'all 0.2s',
                                    transform: `rotate(${item._expandDetails ? 90 : 0}deg)`
                                }
                            }}
                            onClick={(event): void => {
                                event.stopPropagation();
                                const newItem: any = { ...item, _expandDetails: !item._expandDetails };
                                if (newItem._expandDetails) {
                                    // preserve to be restored when refreshed
                                    _expandedTrialIds.add(newItem.id);
                                } else {
                                    _expandedTrialIds.delete(newItem.id);
                                }
                                const newItems = displayedItems.map(item => (item.id === newItem.id ? newItem : item));
                                setDisplayedItems(newItems);
                            }}
                            onMouseDown={(e): void => {
                                e.stopPropagation();
                            }}
                            onMouseUp={(e): void => {
                                e.stopPropagation();
                            }}
                        />
                    );
                },
                fieldName: 'expand',
                isResizable: false,
                minWidth: 20,
                maxWidth: 20
            }
        ];

        // looking at the first row only for now
        for (const k of Object.keys(tableItems[0])) {
            if (k === 'metric/default') {
                // FIXME: default metric is hacked as latestAccuracy currently
                continue;
            }
            const columnTitle = _inferColumnTitle(k);
            // TODO: add blacklist
            // 0.85: tableWidth / screen
            const widths = window.innerWidth * 0.85;
            columns.push({
                name: columnTitle,
                key: k,
                fieldName: k,
                minWidth: widths * 0.12,
                maxWidth: widths * 0.19,
                isResizable: true,
                onColumnClick: _onColumnClick,
                ...(k === 'status' && {
                    // color status
                    onRender: (record): React.ReactNode => (
                        <span className={`${record.status} commonStyle`}>{record.status}</span>
                    )
                }),
                ...(k === 'message' && {
                    onRender: (record): React.ReactNode => <TooltipHostIndex value={record.message} />
                }),
                ...((k.startsWith('metric/') || k.startsWith('space/')) && {
                    // show tooltip
                    onRender: (record): React.ReactNode => <TooltipHostIndex value={record[k]} />
                }),
                ...(k === 'latestAccuracy' && {
                    // FIXME: this is ad-hoc
                    onRender: (record): React.ReactNode => <TooltipHostIndex value={record._formattedLatestAccuracy} />
                }),
                ...(['startTime', 'endTime'].includes(k) && {
                    onRender: (record): React.ReactNode => <span>{formatTimestamp(record[k], '--')}</span>
                }),
                ...(k === 'duration' && {
                    onRender: (record): React.ReactNode => <span>{convertDuration(record[k])}</span>
                }),
                ...(k === 'id' && {
                    onRender: (record): React.ReactNode => (
                        <Stack horizontal className='idCopy'>
                            <div>{record.id}</div>
                            <CopyButton value={record.id} />
                        </Stack>
                    )
                })
            });
        }
        // operations column
        columns.push({
            name: 'Operation',
            key: '_operation',
            fieldName: 'operation',
            minWidth: 150,
            maxWidth: 160,
            isResizable: true,
            className: 'detail-table',
            onRender: _renderOperationColumn
        });

        for (const column of columns) {
            if (column.key === sortInfo.field) {
                column.isSorted = true;
                column.isSortedDescending = sortInfo.isDescend;
            } else {
                column.isSorted = false;
                column.isSortedDescending = true;
            }
        }
        return columns;
    };

    const _updateTableSource = (): void => {
        // call this method when trials or the computation of trial filter has changed
        let items = _trialsToTableItems(tableSource);
        if (searchItems.length > 0) {
            items = getTrialsBySearchFilters(items, searchItems, relation); // use search filter to filter data
        }
        if (items.length > 0) {
            const columns = _buildColumnsFromTableItems(items);
            setDisplayedItems(items);
            setColumns(columns);
        } else {
            setDisplayedItems([]);
            setColumns([]);
        }
    };

    const _updateDisplayedColumns = (displayedColumns: string[]): void => {
        setDisplayedColumns(displayedColumns);
    };

    const changeSearchFilterList = (arr: Array<SearchItems>): void => {
        setSearchItems(arr);
    };

    useEffect(() => {
        _updateTableSource();

        // },[tableSource, sortInfo, searchItems]); // TODO总数据源，表格排序规则触发页面更新, 看代码 searchItmes不用写进来
    }, [tableSource, sortInfo, selectedRowIds]); // 总数据源，表格排序规则触发页面更新, 看代码 searchItmes不用写进来

    return (
        <div id='tableList'>
            <Stack horizontal className='panelTitle' style={{ marginTop: 10 }}>
                <span style={{ marginRight: 12 }}>{tableListIcon}</span>
                <span className='fontColor333'>Trial jobs</span>
            </Stack>
            <Stack horizontal className='allList'>
                <StackItem>
                    <Stack horizontal horizontalAlign='end' className='allList'>
                        <Search
                            searchFilter={searchItems} // search filter list
                            changeSearchFilterList={changeSearchFilterList}
                        />
                    </Stack>
                </StackItem>

                <StackItem styles={{ root: { position: 'absolute', right: '0' } }}>
                    <DefaultButton
                        className='allList-button-gap'
                        text='Add/Remove columns'
                        onClick={(): void => {
                            setCustomizeColumnsDialogVisible(true);
                        }}
                    />
                    <DefaultButton
                        text='Compare'
                        className='allList-compare'
                        onClick={(): void => {
                            setCompareDialogVisible(true);
                        }}
                        disabled={selectedRowIds.length === 0}
                    />
                    {/* compare model: trial intermediates graph; table: id,no,status,default dict value */}
                    {compareDialogVisible && (
                        <Compare
                            title='Compare trials'
                            trials={tableSource.filter(trial => selectedRowIds.includes(trial.id))}
                            onHideDialog={(): void => {
                                setCompareDialogVisible(false);
                            }}
                            changeSelectTrialIds={changeSelectTrialIds}
                        />
                    )}
                    <TensorboardUI selectedRowIds={selectedRowIds} changeSelectTrialIds={changeSelectTrialIds} />
                </StackItem>
            </Stack>
            {columns && displayedItems && (
                <PaginationTable
                    columns={columns.filter(
                        column =>
                            displayedColumns.includes(column.key) ||
                            ['_expand', '_operation', '_selected'].includes(column.key)
                    )}
                    items={displayedItems}
                    compact={true}
                    selectionMode={0}
                    selectionPreservedOnEmptyClick={true}
                    onRenderRow={(props): any => {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        return <ExpandableDetails detailsProps={props!} isExpand={props!.item._expandDetails} />;
                    }}
                />
            )}
            {intermediateDialogTrial.length !== 0 && (
                // {intermediateDialogTrial !== undefined && (
                <Compare
                    title='Intermediate results'
                    trials={intermediateDialogTrial}
                    onHideDialog={(): void => {
                        setIntermediateDialogTrial([]);
                        // setIntermediateDialogTrial(undefined);
                    }}
                />
            )}
            {customizeColumnsDialogVisible && (
                <ChangeColumnComponent
                    selectedColumns={displayedColumns}
                    allColumns={columns
                        .filter(column => !column.key.startsWith('_'))
                        .map(column => ({ key: column.key, name: column.name }))}
                    onSelectedChange={_updateDisplayedColumns}
                    onHideDialog={(): void => {
                        setCustomizeColumnsDialogVisible(false);
                    }}
                    whichComponent='table'
                />
            )}
            {/* Clone a trial and customize a set of new parameters */}
            {/* visible is done inside because prompt is needed even when the dialog is closed */}
            <Customize
                visible={copiedTrialId !== undefined}
                copyTrialId={copiedTrialId || ''}
                closeCustomizeModal={(): void => {
                    setCopiedTrialId(undefined);
                }}
            />
        </div>
    );
}

export default TableList;
