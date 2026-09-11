import { registerWebModule, NativeModule } from 'expo';

class CallstateModule extends NativeModule<{}> {}

export default registerWebModule(CallstateModule, 'CallstateModule');
