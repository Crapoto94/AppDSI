import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import WordCloud, { type CloudWord } from '../../../components/notes/WordCloud';

export default function NotesWordcloudWidget() {
  const { token } = useAuth();
  const [words, setWords] = useState<CloudWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/notes/wordcloud', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setWords(Array.isArray(r.data?.words) ? r.data.words : []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title="Mes Notes — nuage de mots" loading={loading} error={error}>
      <WordCloud words={words} height={260} emptyLabel="Aucune note analysée pour le moment" />
    </WidgetWrapper>
  );
}
