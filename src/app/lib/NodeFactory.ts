import { INode } from './INode'
import { EtherNode } from './EtherNode';
import { NodeConfig, EtherConfig } from './NodeConfig';

export class NodeFactory {
    static Create(config: NodeConfig): INode {
        switch(config.type) {
            case 'Ether': return new EtherNode(<EtherConfig>config);
            default: throw 'Unknown node config type ' + config.type;
        }
    }
}
