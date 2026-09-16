import React from 'react';
import MailAnalyseMapCard from './MailAnalyseMapCommon';
import type { MapWidgetProps } from './MailAnalyseMapCommon';

export default function MailAnalyseMapFranceWidget(props: MapWidgetProps) {
  return (
    <MailAnalyseMapCard
      scope="home"
      title="Connexions suspectes — France"
      center={[46.6, 2.2]}
      zoom={5}
      {...props}
    />
  );
}
