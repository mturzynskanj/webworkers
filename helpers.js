const BigNumber           = require('bignumber.js');
const { PRICE_SCALE }     = require('./constants');
const jwtDecode           = require('jwt-decode');

//------------------------------------------------------------------------------

const subscriptionToValue = (subscription, market_data, orders, trades, last_trade) => {
    let value = null;

    if (subscription.type == 'SIZE' || subscription.type == 'CUM_SIZE')
    {
        value = sizeSubscriptionToValue(subscription, market_data);

        if (value !== null)
            value = value.toFixed(2);
    }
    else if (subscription.type == 'MID')
    {
        value = midSubscriptionToValue(subscription, market_data);
    }
    else if (subscription.type == 'PCT_UP_DOWN')
    {
        value = pctUpDownSubscriptionToValue(subscription, market_data);
    }
    else if (subscription.type == 'ORDER')
    {
        return orderSubscriptionToValue(subscription, orders);

    }
    else if (subscription.type == 'QTY_TRADED')
    {
        value = qtyTradeSubscriptionToValue(subscription, trades);

        if (value !== null)
            value = value.toFixed(2);
    }
    else if (subscription.type == 'LAST_TRADE')
    {
        value = lastTradeSubscriptionToValue(subscription, last_trade);
    }
    else if (subscription.type == 'TOTAL_WORKING')
    {
        return totalWorkingSubscriptionToValue(subscription, orders);
    }

    return value;
}

//------------------------------------------------------------------------------

const sizeSubscriptionToValue = (sub, market_data) => {
    let { symbol, venue, side, price, interval, type } = sub;

    price = Math.round(parseFloat(price) * PRICE_SCALE);
    interval = Math.round(parseFloat(interval) * PRICE_SCALE);

    if (Array.isArray(venue))
    {
        if (side == 'ASK')
        {
            let s = 0;

            if (sub.type == 'CUM_SIZE')
            {
                venue.forEach(v => {
                    const key = `${symbol}:${v}:${side}`

                    const sum = sumIntervalInTree(market_data[key], Number.NEGATIVE_INFINITY, price, true, true);

                    if (sum !== null)
                        s += sum;
                })
            }
            else
            {
                const threshold = price - interval

                venue.forEach(v => {
                    const key = `${symbol}:${v}:${side}`

                    const sum = sumIntervalInTree(market_data[key], threshold, price, false, true)

                    if (sum !== null)
                        s += sum;
                })
            }

            if (s == 0) return null;

            return s;
        }
        else
        {
            let s = 0;

            if (sub.type == 'CUM_SIZE')
            {
                venue.forEach(v => {
                    const key = `${symbol}:${v}:${side}`

                    const sum = sumIntervalInTree(market_data[key], price, Number.POSITIVE_INFINITY, true, true);

                    if (sum !== null)
                        s += sum;
                })
            }
            else
            {
                const threshold = price + interval

                venue.forEach(v => {
                    const key = `${symbol}:${v}:${side}`

                    const sum = sumIntervalInTree(market_data[key], price, threshold, true, false);

                    if (sum !== null)
                        s += sum;
                })
            }

            if (s == 0) return null;

            return s;
        }
    }
    else
    {
        if (side == 'ASK')
        {
            const key = `${symbol}:${venue}:${side}`

            const asks = market_data[key];

            if (sub.type == 'CUM_SIZE')
            {
                return sumIntervalInTree(asks, Number.NEGATIVE_INFINITY, price, true, true);
            }
            else
            {
                const threshold = price - interval

                return sumIntervalInTree(asks, threshold, price, false, true);
            }
        }
        else
        {
            const key = `${symbol}:${venue}:${side}`

            const bids = market_data[key];

            if (sub.type == 'CUM_SIZE')
            {
                return sumIntervalInTree(bids, price, Number.POSITIVE_INFINITY, true, true);
            }
            else
            {
                const threshold = price + interval

                return sumIntervalInTree(bids, price, threshold, true, false)
            }
        }
    }
}

//------------------------------------------------------------------------------

const midSubscriptionToValue = (sub, market_data) => {
    const { symbol, venue } = sub;

    const mid = getMid(symbol, venue, market_data);

    if (mid === null) return null;

    return BigNumber(mid / PRICE_SCALE).toFixed(10);
}

//------------------------------------------------------------------------------

const getMid = (symbol, venue, market_data) => {
    let min_ask;
    let max_bid;

    if (Array.isArray(venue))
    {
        const min_asks = venue.map(v => {
            const key = `${symbol}:${v}:ASK`;

            return minKeyInTree(market_data[key]);
        }).filter(v => v !== null)

        const max_bids = venue.map(v => {
            const key = `${symbol}:${v}:BID`;

            return maxKeyInTree(market_data[key]);
        }).filter(v => v !== null)

        min_ask = min_asks.min();
        max_bid = max_bids.max();
    }
    else
    {
        const ask_key = `${symbol}:${venue}:ASK`;
        const bid_key = `${symbol}:${venue}:BID`;

        const asks = market_data[ask_key];
        const bids = market_data[bid_key];

        min_ask = minKeyInTree(asks);
        max_bid = maxKeyInTree(bids);
    }

    if (min_ask && max_bid)
    {
        return (min_ask + max_bid) / 2;
    }

    if (max_bid)
        return max_bid;

    if (min_ask)
        return min_ask;

    return null;
}

//------------------------------------------------------------------------------

const qtyTradeSubscriptionToValue = (sub, trades) => {
    let { symbol, venue, price, interval } = sub;

    price = Math.round(parseFloat(price) * PRICE_SCALE);
    interval = Math.round(parseFloat(interval) * PRICE_SCALE );

    if (Array.isArray(venue))
    {
        let s = 0;

        const threshold = price - interval;

        venue.forEach(v => {
            const trade_tree = trades[`${symbol}:${v}`];

            const sum = sumIntervalInTree(trade_tree, threshold, price, false, true)

            if (sum !== null)
                s += sum;
        })

        if (s == 0) return null;

        return s;
    }

    const trade_tree = trades[`${symbol}:${venue}`]

    return sumIntervalInTree(trade_tree, price - interval, price, false, true)

}

//------------------------------------------------------------------------------

const lastTradeSubscriptionToValue = (sub, last_trade) => {
    if (last_trade === null) return { qty: null, direction: null };

    let { symbol, price, interval } = sub;

    if (symbol != last_trade.symbol) return { qty: null, direction: null };

    price = Math.round(parseFloat(price) * PRICE_SCALE);
    interval = Math.round(parseFloat(interval) * PRICE_SCALE );

    if (last_trade.side === 'BUY')
    {
        if (last_trade.price > price - interval && last_trade.price <= price)
            return { direction: last_trade.direction, qty: parseFloat(last_trade.qty).toFixed(4) }
    }
    else
    {
        if (last_trade.price >= price && last_trade.price < price + interval )
            return { direction: last_trade.direction, qty: parseFloat(last_trade.qty).toFixed(4) }
    }

    return { qty: null, direction: null };
}

//------------------------------------------------------------------------------

const pctUpDownSubscriptionToValue = (sub, market_data) => {
    const { symbol, venue, price } = sub;

    let mid = getMid(symbol, venue, market_data);

    if (mid === null) return null;

    mid = mid / PRICE_SCALE;

    return (Math.abs((parseFloat(price) / mid ) - 1) * 100).toFixed(2)
}

//------------------------------------------------------------------------------

const orderSubscriptionToValue = (sub, orders) => {
    let { symbol, venue, price, interval } = sub;

    price = Math.round(parseFloat(price) * PRICE_SCALE);
    interval = Math.round(parseFloat(interval) * PRICE_SCALE);

    const down_threshold = price - interval;
    const down_it = orders.le(price);

    let asks = [];

    while (down_it.valid && down_it.key > down_threshold)
    {
        const order = down_it.value;

        if (order.side == 'ASK' && order.symbol == symbol && order.target == venue)
            asks.push(order);

        down_it.prev();
    }


    let bids = [];

    const up_threshold = price + interval
    const up_it = orders.ge(price);

    while (up_it.valid && up_it.key < up_threshold)
    {
        const order = up_it.value;

        if (order.side == 'BID' && order.symbol == symbol && order.target == venue)
            bids.push(order);

        up_it.next();
    }

    if (bids.length == 0 && asks.length == 0) return null;

    let working_asks = null;
    let filled_asks = null;
    let working_bids = null;
    let filled_bids = null;

    if (asks.length > 0)
    {
        const tot_qty = asks.reduce((tot, order) => tot.plus(order.qty) , BigNumber(0))
        const tot_filled = asks.reduce((tot, order) => tot.plus(order.filled) , BigNumber(0))

        working_asks = tot_qty.minus(tot_filled).toFixed(2);
        filled_asks = tot_filled.toFixed(2);
    }

    if (bids.length > 0)
    {
        const tot_qty = bids.reduce((tot, order) => tot.plus(order.qty) , BigNumber(0))
        const tot_filled = bids.reduce((tot, order) => tot.plus(order.filled) , BigNumber(0))

        working_bids = tot_qty.minus(tot_filled).toFixed(2);
        filled_bids = tot_filled.toFixed(2);
    }

    return {
        bids,
        asks,
        working_asks,
        filled_asks,
        working_bids,
        filled_bids
    }
}

//------------------------------------------------------------------------------

const totalWorkingSubscriptionToValue = (sub, orders) => {
    const { symbol, venue } = sub;

    let tot_ask_qty = BigNumber(0);
    let tot_ask_filled = BigNumber(0);
    let tot_bid_qty = BigNumber(0);
    let tot_bid_filled = BigNumber(0);

    orders.forEach((key, order) => {
        if (order.symbol != symbol || order.target != venue) return;

        if (order.side == 'ASK')
        {
            tot_ask_qty = tot_ask_qty.plus(order.qty);
            tot_ask_filled = tot_ask_filled.plus(order.filled);
        }
        else
        {
            tot_bid_qty = tot_bid_qty.plus(order.qty);
            tot_bid_filled = tot_bid_filled.plus(order.filled);
        }
    })

    return {
        ask: tot_ask_qty.minus(tot_ask_filled).toFixed(2),
        bid: tot_bid_qty.minus(tot_bid_filled).toFixed(2)
    }
}

//------------------------------------------------------------------------------

const sumIntervalInTree = (tree, begin, end, begin_inclusive, end_inclusive) => {
    if (tree === undefined) return null;

    const it = begin_inclusive ? tree.lowerBound({ p: begin }) : tree.upperBound({ p: begin });

    let sum = 0;
    if (end_inclusive)
    {
        if (end === Number.POSITIVE_INFINITY)
        {
            while (it.data() !== null)
            {
                sum += it.data().q;
                it.next();
            }
        }
        else
        {
            while (it.data() !== null && it.data().p <= end)
            {
                sum += it.data().q;
                it.next();
            }
        }
    }
    else
    {
        if (end === Number.POSITIVE_INFINITY)
        {
            while (it.data() !== null)
            {
                sum += it.data().q;
                it.next()
            }
        }
        else
        {
            while (it.data() !== null && it.data().p < end)
            {
                sum += it.data().q;
                it.next()
            }
        }
    }

    if (sum == 0) return null;

    return sum;
}

const minKeyInTree = (tree) => {
    if (tree === undefined) return null;

    if (tree.min() === null) return null;

    return tree.min().p;
}

const maxKeyInTree = (tree) => {
    if (tree === undefined) return null;

    if (tree.max() === null) return null;

    return tree.max().p
}

//------------------------------------------------------------------------------

const selectSocketSubscriptions = (ladder_info, user_token) => {
    if (ladder_info === null || user_token === null) return [];

    const { username:client } = jwtDecode(user_token);

    const { account, symbol, venue, all_clients } = ladder_info;

    const split_symbol = symbol.split('/');

    const subscriptions = [];

    if (Array.isArray(venue))
    {
        venue.forEach(v => {
            subscriptions.push({
                type: 'MARKET_DATA',
                symbol,
                venue: v
            })

            subscriptions.push({
                type: 'BALANCE',
                account,
                target: v,
                asset: split_symbol[0]
            })

            if (split_symbol[1] !== undefined)
            {
                subscriptions.push({
                    type: 'BALANCE',
                    account,
                    target: v,
                    asset: split_symbol[1]

                })
            }
        })
    }
    else
    {
        subscriptions.push({
            type: 'MARKET_DATA',
            symbol,
            venue
        })

        if (all_clients)
        {
            subscriptions.push({
                type: 'ORDER',
                symbol,
                target: venue,
                account
            })
        }
        else
        {
            subscriptions.push({
                type: 'ORDER',
                symbol,
                target: venue,
                account,
                client
            })
        }

        subscriptions.push({
            type: 'TRADE',
            account,
            target: venue,
            symbol
        })

        subscriptions.push({
            type: 'BALANCE',
            account,
            target: venue,
            asset: split_symbol[0]
        })

        if (split_symbol[1] !== undefined)
        {
            subscriptions.push({
                type: 'BALANCE',
                account,
                target: venue,
                asset: split_symbol[1]
            })
        }

        subscriptions.push({
            type: 'ORDER_REJECT',
            account,
            client,
            target: venue,
            symbol
        })
    }

    return subscriptions;
}

//------------------------------------------------------------------------------

module.exports = {
    subscriptionToValue,
    sizeSubscriptionToValue,
    midSubscriptionToValue,
    pctUpDownSubscriptionToValue,
    orderSubscriptionToValue,
    totalWorkingSubscriptionToValue,
    qtyTradeSubscriptionToValue,
    lastTradeSubscriptionToValue,
    selectSocketSubscriptions
}





