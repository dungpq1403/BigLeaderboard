"use client";

import { useEffect, useState } from 'react';
import styles from './ContactList.module.css';

interface Contact {
  id: string;
  platform: string;
  contact: string;
}

type ContactInput = {
  id?: string | number;
  platform: string;
  contact: string;
};

interface ContactListProps {
  value?: ContactInput[];
  onChange?: (contacts: Contact[]) => void;
}

function normalizeContact(contact: ContactInput, index: number): Contact {
  const id =
    contact.id != null && String(contact.id) !== ''
      ? String(contact.id)
      : `contact-${index}`;
  return {
    id,
    platform: contact.platform || 'facebook',
    contact: contact.contact || '',
  };
}

const platformOptions = [
  { value: 'facebook', label: 'Facebook', icon: '📘' },
  { value: 'discord', label: 'Discord', icon: '💬' },
  { value: 'gmail', label: 'Gmail', icon: '📧' },
  { value: 'zalo', label: 'Zalo', icon: '💚' },
];

export default function ContactList({ value = [], onChange }: ContactListProps) {
  const [contacts, setContacts] = useState<Contact[]>(() =>
    value.map(normalizeContact)
  );

  useEffect(() => {
    setContacts(value.map(normalizeContact));
  }, [value]);

  const updateContacts = (newContacts: Contact[]) => {
    setContacts(newContacts);
    if (onChange) {
      onChange(newContacts);
    }
  };

  const addContact = () => {
    const newContact: Contact = {
      id: Date.now().toString(),
      platform: 'facebook',
      contact: '',
    };
    updateContacts([...contacts, newContact]);
  };

  const removeContact = (id: string) => {
    updateContacts(contacts.filter(c => c.id !== id));
  };

  const updateContact = (id: string, field: keyof Contact, fieldValue: string) => {
    const updated = contacts.map(contact =>
      contact.id === id ? { ...contact, [field]: fieldValue } : contact
    );
    updateContacts(updated);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <label className={styles.label}>Thông tin liên lạc</label>
        <button type="button" onClick={addContact} className={styles.addButton}>
          + Thêm liên lạc
        </button>
      </div>
      
      {contacts.length === 0 && (
        <div className={styles.emptyMessage}>
          Chưa có thông tin liên lạc. Nhấn "Thêm liên lạc" để thêm.
        </div>
      )}
      
      {contacts.map((contact) => (
        <div key={contact.id} className={styles.contactRow}>
          <select
            value={contact.platform}
            onChange={(e) => updateContact(contact.id, 'platform', e.target.value)}
            className={styles.platformSelect}
          >
            {platformOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.icon} {option.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={contact.contact}
            onChange={(e) => updateContact(contact.id, 'contact', e.target.value)}
            placeholder="Nhập thông tin liên lạc (username, email, link...)"
            className={styles.contactInput}
          />
          <button
            type="button"
            onClick={() => removeContact(contact.id)}
            className={styles.removeButton}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}