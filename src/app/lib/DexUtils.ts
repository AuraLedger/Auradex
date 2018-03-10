import { EntryMessage } from './AuradexApi';
import { INode } from './INode';

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
        node.getBalance(entry.address, function(err, bal) {
            if(err)
                fail('unable to verify balance of entry');
            else {
                if(entry.act == 'bid') {
                    if ((entry.amount * entry.price) + node.getInitFee() > bal)
                        fail('bidder is short on funds')
                    else
                        success();
                } else if (entry.act == 'ask') {
                    if (entry.amount + node.getInitFee() > bal)
                        fail('asker is short on funds')
                    else
                        success();
                } else
                    fail('unknown entry type ' + entry.act);
            }
        });
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
}
