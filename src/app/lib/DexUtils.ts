import { EntryMessage } from './AuradexApi';
import { INode } from './INode';

export class DexUtils {
    static verifyEntry(entry: EntryMessage, node: INode, fee: number, success: () => void, fail: (err: any) => void) {
        node.getBalance(entry.address, function(err, bal) {
            if(err)
                fail(err);
            else
                DexUtils.verifyEntryFull(entry, node, bal, fee, success, fail);
        });
    }

    static verifyEntryFull(entry: EntryMessage, node: INode, bal: number, fee: number,
        success: () => void, fail: (err: any) => void) {

        //verify min
        if(entry.min > entry.amount * entry.price + fee) {
            fail('min ' + entry.min + ' is > than total size ' + entry.amount + ' * ' + entry.price + ' + fee ' + fee );
            return;
        }

        //verify sig
        var msg = JSON.stringify({
            act: entry.act,
            address: entry.address,
            amount: entry.amount,
            price: entry.price,
            min: entry.min,
            nonce: entry.nonce
        });
        var expected = node.recover(msg, entry.sig); 

        if(expected != entry.address) {
            fail('invalid signature')
            return;
        }

        //verify bidder/asker has enough funds
        node.getBalance(entry.address, function(err, bal) {
                if(err)
                    fail('unable to verify balance of entry');
                else {
                    if(entry.act == 'bid') {
                        if ((entry.amount * entry.price) + fee > bal)
                            fail('bidder is short on funds')
                        else
                            success();
                    } else if (entry.act == 'ask') {
                        if (entry.amount + fee > bal)
                            fail('asker is short on funds')
                        else
                            success();
                    } else
                        fail('unknown entry type ' + entry.act);
                }
            });
 
    }
}


