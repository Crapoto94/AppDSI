import React from 'react';
import MailAnalyseMapCard from './MailAnalyseMapCommon';
import type { MapWidgetProps } from './MailAnalyseMapCommon';

export default function MailAnalyseMapWorldWidget(props: MapWidgetProps) {
  return (
    <MailAnalyseMapCard
      scope="world"
      title="Connexions suspectes — Monde"
      center={[20, 0]}
      zoom={2}
      {...props}
    />
  );
}
