import { EntryMessage, CancelMessage } from './AuradexApi';
import { INode } from './INode';
import * as SortedArray from 'sorted-array';

export class DexUtils {
    static verifyEntry(entry: EntryMessage, node: INode, bookBalance: number, success: () => void, fail: (err: any) => void) {
        node.getBalance(entry.address, function(err, bal) {
            if(err)
                fail(err);
            else
                DexUtils.verifyEntryFull(entry, node, bal - bookBalance, success, fail);
        });
    }

    static verifyEntryFull(entry: EntryMessage, node: INode, bal: number, 
        success: () => void, fail: (err: any) => void) {

        //verify min
        if(entry.min > entry.amount * entry.price) {
            fail('min ' + entry.min + ' is > than total size ' + entry.amount + ' * ' + entry.price );
            return;
        }

        //verify simple amounts
        if(entry.amount <= 0)
        fail('amount must be greater than 0');

        if(entry.price <= 0)
        fail('price must be greater than 0');

        //verify sig
        var msg = DexUtils.getSigMessage(entry);
        var expected = node.recover(msg, entry.sig || ''); 

        if(expected != entry.address) {
            fail('invalid signature')
            return;
        }

        //verify bidder/asker has enough funds
        if(entry.act == 'bid') {
            if ((entry.amount * entry.price) + node.getInitFee() > bal)
                fail('bidder is short on available funds')
            else
                success();
        } else if (entry.act == 'ask') {
            if (entry.amount + node.getInitFee() > bal)
                fail('asker is short on available funds')
            else
                success();
        } else
        fail('unknown entry type ' + entry.act);
    }

    static verifyRedeemBalanceFull(node: INode, bal: number, success: () => void, fail: (err) => void) {
        if(bal < node.getRedeemFee())
            fail('Not enough funds to redeem');
        else
            success();
    }

    static verifyRedeemBalance(address: string, node: INode, bookBalance: number, success: () => void, fail: (err) => void) {
        node.getBalance(address, function(err, bal) {
            if(err)
                fail(err);
            else
                DexUtils.verifyRedeemBalanceFull(node, bal - bookBalance, success, fail);
        });
    }

    static getSigMessage(entry: EntryMessage): string {
        return JSON.stringify({
            act: entry.act,
            address: entry.address,
            redeemAddress: entry.redeemAddress,
            amount: entry.amount,
            price: entry.price,
            min: entry.min,
            nonce: entry.nonce
        });
    }

    static removeFromBook(book: SortedArray, obj: CancelMessage): EntryMessage | null {
        //sorted-array search find one item with the same price, but we need 
        //to search up and down from there to check them all in case there are multiple entries at the same price
        var i: number = book.search(obj); 
        var j: number;
        if(i >= 0) {
            //search up
            for(j = i; j < book.array.length; j++) {
                if(book.array[j].price != obj.price)
                    break;
                if(book.array[j]._id == obj._id) {
                    return book.array.splice(j, 1)[0];
                }
            }

            //search down
            for(j = i-1; j >= 0; j--) {
                if(book.array[j].price != obj.price)
                    break;
                if(book.array[j]._id == obj._id) {
                    return book.array.splice(j, 1)[0];
                }
            }
        }
        return null;
    }
}
