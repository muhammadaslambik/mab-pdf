import type { CustomProps } from '../tools/types';
import Annotator from './Annotator';
export default function SignPdf(p: CustomProps) { return <Annotator {...p} mode="sign" />; }
