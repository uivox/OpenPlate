import React, { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { clockText, parseClock } from '../lib/reminders';
import { fonts, radius, useColors } from '../lib/theme';

/** HH:MM field that keeps the typing and only takes a valid time (on leaving the field or Enter). */
export function TimeField({
  value,
  label,
  onChange,
  onInvalid,
  testID,
}: {
  value: number;
  label: string;
  onChange: (v: number) => void;
  onInvalid: (invalid: boolean) => void;
  testID?: string;
}) {
  const c = useColors();
  const [text, setText] = useState(clockText(value));
  const [invalid, setInvalidState] = useState(false);
  const setInvalid = (v: boolean) => {
    setInvalidState(v);
    onInvalid(v);
  };
  useEffect(() => {
    setText(clockText(value));
    setInvalidState(false);
    onInvalid(false);
    // only react to outside changes of the time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = () => {
    const v = parseClock(text);
    if (v === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(clockText(v));
    if (v !== value) onChange(v);
  };
  return (
    <TextInput
      value={text}
      onChangeText={(s) => {
        setText(s);
        setInvalid(false);
      }}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType="numbers-and-punctuation"
      returnKeyType="done"
      maxLength={5}
      selectTextOnFocus
      accessibilityLabel={label}
      testID={testID}
      selectionColor={c.accent}
      style={{
        backgroundColor: c.cardAlt,
        borderRadius: radius.s,
        borderWidth: invalid ? 1.5 : 0,
        borderColor: c.danger,
        width: 84,
        paddingVertical: 10,
        textAlign: 'center',
        fontSize: 18,
        color: c.text,
        fontFamily: fonts.bodySemi,
      }}
    />
  );
}
