import { useMemo } from 'react';

import styled from 'styled-components';

import transfer from '@assets/images/transactions/transfer.svg';
import {
  Account,
  Amount,
  AssetIcon,
  Box,
  DashboardPanel,
  EditableAccountLabel,
  FixedSizeCollapsibleTable,
  Icon,
  LinkApp
} from '@components';
import { DEFAULT_ASSET_DECIMAL, ROUTE_PATHS } from '@config';
import { getFiat } from '@config/fiats';
import { ITxHistoryEntry, useRates, useSettings } from '@services';
import { txIsFailed, txIsPending, txIsSuccessful } from '@services/Store/helpers';
import { getMergedTxHistory, useSelector } from '@store';
import { getTxTypeMetas } from '@store/txHistory.slice';
import { COLORS } from '@theme';
import { translateRaw } from '@translations';
import { Asset, ITxStatus, StoreAccount, TTicker, TxType } from '@types';
import { bigify, convertToFiat, fromTokenBase, generateDeterministicAddressUUID, isSameAddress, useScreenSize } from '@utils';

import { constructTxTypeConfig } from './helpers';
import NoTransactions from './NoTransactions';
import TransactionLabel from './TransactionLabel';

interface Props {
  className?: string;
  accountsList: StoreAccount[];
}

export interface ITxTypeConfigObj {
  icon(): any;
  label(assetTxTypeDesignation: string): string;
}

const SAssetIcon = styled(AssetIcon)`
  filter: grayscale(1); /* W3C */
`;

const CCircle = styled('div')`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: ${COLORS.GREY_LIGHTEST};
  border: 3px solid #ffffff;
  bottom: -9px;
  right: -9px;
  border-radius: 50%;
  z-index: 2;
  height: 24px;
  width: 24px;
`;
const SCombinedCircle = (asset: Asset) => {
  return (
    <CCircle>
      <SAssetIcon uuid={asset.uuid} size={'16px'} />
    </CCircle>
  );
};

const makeTxIcon = (txConfig: ITxTypeConfigObj, asset?: Asset) => {
  const greyscaleIcon = asset && <>{SCombinedCircle(asset)}</>;
  const baseIcon = (
    <Box mr="16px" position="relative">
      <img src={txConfig?.icon() ?? transfer} width="36px" height="36px" />
      {greyscaleIcon}
    </Box>
  );
  return baseIcon;
};

export default function RecentTransactionList({ accountsList, className = '' }: Props) {
  const { getAssetRate } = useRates();
  const { settings } = useSettings();
  const txTypeMetas = useSelector(getTxTypeMetas);
  const txHistory = useSelector(getMergedTxHistory);
  const { isMobile } = useScreenSize();

  const accountTxs = useMemo(
    () =>
      txHistory
        .filter((tx) =>
          accountsList.some(
            (a) => isSameAddress(a.address, tx.to) || isSameAddress(a.address, tx.from)
          )
        )
        .map(({ txType, ...tx }) => ({ ...tx, txType: txType as TxType })),
    [txHistory, accountsList.length]
  );
  const accountsMap = accountsList.reduce((acc, cur) => {
    acc[cur.uuid] = true
    return acc;
  }, {} as {[key: string]: boolean} );
  const pending = accountTxs.filter(txIsPending);
  const completed = accountTxs.filter(txIsSuccessful);
  const failed = accountTxs.filter(txIsFailed);
  const createEntries = (_: string, collection: ITxHistoryEntry[]) =>
    collection.map(
      ({
        timestamp,
        hash,
        status,
        from,
        to,
        baseAsset,
        receiverAddress,
        valueTransfers,
        value,
        fromAddressBookEntry,
        toAddressBookEntry,
        networkId,
        txType,
        displayAsset
      }) => {
        const labelFromProps = {
          addressBookEntry: fromAddressBookEntry,
          address: from,
          networkId
        };
        const recipient = receiverAddress ?? to;
        const labelToProps = {
          addressBookEntry: toAddressBookEntry,
          address: recipient,
          networkId
        };
        if (valueTransfers.length == 0) {
          valueTransfers.push({
            asset: baseAsset,
            to,
            from,
            amount: fromTokenBase(bigify(value), DEFAULT_ASSET_DECIMAL).toString()
          });
        }
        const entryConfig = constructTxTypeConfig(txTypeMetas[txType] ?? { type: txType });
        const sentValueTransfers = valueTransfers.filter((t) => accountsMap[generateDeterministicAddressUUID(networkId, t.from)]);
        const receivedValueTransfers = valueTransfers.filter((t) => accountsMap[generateDeterministicAddressUUID(networkId, t.to)]);
        const receivedFiatValue = receivedValueTransfers.reduce((acc, cur) => {
          return cur.amount ? acc.plus(convertToFiat(
            cur.amount,
            getAssetRate(cur.asset)
          )) : acc;
        }, bigify('0'))
        const sentFiatValue = sentValueTransfers.reduce((acc, cur) => {
          return cur.amount ? acc.plus(convertToFiat(
            cur.amount,
            getAssetRate(cur.asset)
          )) : acc;
        }, bigify('0'))
        return [
          <TransactionLabel 
            key={0}
            image={makeTxIcon(entryConfig, displayAsset)}
            label={entryConfig.label(displayAsset ? displayAsset.ticker : translateRaw('ASSETS'))}
            stage={status}
            date={timestamp}
          />,
          <Account
            key={1}
            title={<EditableAccountLabel {...labelFromProps} />}
            truncate={true}
            address={from}
          />,
          recipient && (
            <Account
              key={2}
              title={<EditableAccountLabel {...labelToProps} />}
              truncate={true}
              address={recipient}
            />
          ),
          <Box key={3}>
            {sentValueTransfers.length > 1 && <Amount
              // Adapt alignment for mobile display
              alignLeft={isMobile}
              asset={{
                amount: sentValueTransfers.length.toString(),
                ticker: translateRaw('ASSETS') as TTicker,
                type: 'erc20'
              }}
              fiat={{
                symbol: getFiat(settings).symbol,
                ticker: getFiat(settings).ticker,
                amount: sentFiatValue.toFixed(2)
              }}
            />}
            {sentValueTransfers.length === 1 && 
              <>{(!sentValueTransfers[0].amount)
                ? <Amount
                  alignLeft={isMobile}
                  text={sentValueTransfers[0].asset.name}
                /> : <Amount
                  alignLeft={isMobile}
                  asset={{
                    amount: bigify(sentValueTransfers[0].amount).toPrecision(6),
                    ticker: sentValueTransfers[0].asset.ticker,
                    type: sentValueTransfers[0].asset.type
                  }}
                  fiat={{
                    symbol: getFiat(settings).symbol,
                    ticker: getFiat(settings).ticker,
                    amount: sentFiatValue.toFixed(2)
                  }}
                />
              }</>
            }
          </Box>,
          <Box key={4}>
            {receivedValueTransfers.length > 1 && <Amount
              // Adapt alignment for mobile display
              alignLeft={isMobile}
              asset={{
                amount: receivedValueTransfers.length.toString(),
                ticker: translateRaw('ASSETS') as TTicker,
                type: 'erc20'
              }}
              fiat={{
                symbol: getFiat(settings).symbol,
                ticker: getFiat(settings).ticker,
                amount: receivedFiatValue.toFixed(2)
              }}
            />}
            {receivedValueTransfers.length === 1 && 
              <>{(!receivedValueTransfers[0].amount)
                ? <Amount
                  alignLeft={isMobile}
                  text={receivedValueTransfers[0].asset.name}
                /> : <Amount
                  alignLeft={isMobile}
                  asset={{
                    amount: bigify(receivedValueTransfers[0].amount).toPrecision(6),
                    ticker: receivedValueTransfers[0].asset.ticker,
                    type: receivedValueTransfers[0].asset.type
                  }}
                  fiat={{
                    symbol: getFiat(settings).symbol,
                    ticker: getFiat(settings).ticker,
                    amount: receivedFiatValue.toFixed(2)
                  }}
                />
              }</>
            }
          </Box>,
          <Box key={5} variant="rowCenter">
            <LinkApp href={`${ROUTE_PATHS.TX_STATUS.path}/?hash=${hash}&network=${networkId}`}>
              {isMobile ? (
                translateRaw('RECENT_TRANSACTIONS_VIEW_MORE')
              ) : (
                <Icon
                  type="more"
                  alt="View more information about this transaction"
                  height="24px"
                />
              )}
            </LinkApp>
          </Box>
        ];
      }
    );

  const groups = [
    {
      title: 'Pending',
      entries: createEntries(ITxStatus.PENDING, pending)
    },
    {
      title: 'Completed',
      entries: createEntries(ITxStatus.SUCCESS, completed)
    },
    {
      title: 'Failed',
      entries: createEntries(ITxStatus.FAILED, failed)
    }
  ];
  const filteredGroups = groups.filter((group) => group.entries.length !== 0);

  const recentTransactionsTable = {
    head: [
      translateRaw('RECENT_TRANSACTIONS_DATE') || 'Date',
      translateRaw('RECENT_TRANSACTIONS_FROM_ADDRESS'),
      translateRaw('RECENT_TRANSACTIONS_TO_ADDRESS'),
      translateRaw('RECENT_TRANSACTIONS_SENT_ASSETS'),
      translateRaw('RECENT_TRANSACTIONS_RECEIVED_ASSETS'),
      ''
    ],
    body: [],
    groups: filteredGroups,
    config: {
      primaryColumn: translateRaw('RECENT_TRANSACTIONS_DATE'),
      sortableColumn: translateRaw('RECENT_TRANSACTIONS_DATE'),
      sortFunction: () => (a: any, b: any) => b.props.date - a.props.date,
      hiddenHeadings: [translateRaw('RECENT_TRANSACTIONS_VIEW_MORE')],
      iconColumns: [translateRaw('RECENT_TRANSACTIONS_VIEW_MORE')],
      reversedColumns: []
    },
    overlayRows: [0]
  };
  return (
    <DashboardPanel
      heading={translateRaw('RECENT_TRANSACTIONS')}
      className={`RecentTransactionsList ${className}`}
    >
      {filteredGroups.length >= 1 ? (
        <FixedSizeCollapsibleTable breakpoint={1000} {...recentTransactionsTable} />
      ) : (
        NoTransactions()
      )}
    </DashboardPanel>
  );
}
