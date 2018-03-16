import { Pipe, PipeTransform } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { BigNumber } from 'bignumber.js';

@Pipe({
    name: 'bigNumber'
})
export class BigNumberPipe extends DecimalPipe {

    transform(value: BigNumber, args?: any): any {
        var num: number;
        if(BigNumber.isBigNumber(value))
            num = value.toNumber();
        else
            num = <any>value;
        if(num || num === 0)
            return super.transform(num, args);
        return 'NaN';
    }
}
