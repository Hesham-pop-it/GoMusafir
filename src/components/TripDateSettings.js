import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { ref, onValue } from 'firebase/database';
import { httpsCallable } from 'firebase/functions';
import { database, functions } from '../config/firebase';
import { seatUsage, selectedDateRange } from '../utils/tripSeatMath';

const keyFor = timestamp => Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : '';

export default function TripDateSettings({ orgId, tripId }) {
    const [trip, setTrip] = useState(null);
    const [balance, setBalance] = useState(null);
    const [editing, setEditing] = useState(false);
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [destination, setDestination] = useState('');
    const [field, setField] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!orgId || !tripId) return;
        const stopTrip = onValue(ref(database, `orgs/${orgId}/trips/${tripId}`), snap => setTrip(snap.val()), () => setTrip(null));
        const stopBalance = onValue(ref(database, `orgs/${orgId}/prepaid_seats`), snap => setBalance(snap.val() || 0), () => setBalance(null));
        return () => { stopTrip(); stopBalance(); };
    }, [orgId, tripId]);

    const range = selectedDateRange(start, end);
    let usage = null;
    try { usage = seatUsage(range.startDate, range.endDate, trip?.total_seats || 15); } catch (_) {}
    const allocated = trip?.seats_allocated ?? trip?.total_seats ?? 15;
    const extra = usage ? Math.max(0, usage.requiredSeats - allocated) : 0;
    const insufficient = balance === null || extra > balance;

    const save = async () => {
        setSaving(true);
        try {
            await httpsCallable(functions, 'updateTripDates')({ tripId, ...range, destination: destination.trim() });
            setEditing(false);
            setField(null);
            Alert.alert('Trip updated', 'Your destination, dates and seat allocation have been updated.');
        } catch (error) {
            Alert.alert('Could not update trip', error.message || 'Please try again.');
        } finally { setSaving(false); }
    };

    if (!trip) return null;
    return <View style={styles.card}>
        <Text style={styles.heading}>Trip destination, dates and seat usage</Text>
        <Text style={styles.text}>{trip.location}</Text>
        <Text style={styles.text}>{keyFor(trip.start_date)} to {keyFor(trip.end_date - 1)}</Text>
        <Text style={styles.text}>{trip.total_seats || 15} participants · {trip.seats_allocated ?? trip.total_seats ?? 15} seats allocated</Text>
        {!editing ? <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => {
            setStart(keyFor(trip.start_date)); setEnd(keyFor(trip.end_date - 1)); setDestination(trip.location || ''); setEditing(true);
        }}><Text style={styles.buttonText}>Edit trip details</Text></TouchableOpacity> : <>
            <Text style={styles.text}>Destination</Text>
            <TextInput accessibilityLabel="Destination city and country" style={[styles.text, styles.destination]}
                value={destination} onChangeText={setDestination} editable={!saving} maxLength={200}
                placeholder="City, country" placeholderTextColor="#999" />
            <Text style={styles.text}>Every started 30-day period uses another seat per participant. Both selected dates are included.</Text>
            <TouchableOpacity accessibilityRole="button" disabled={saving} style={styles.date} onPress={() => setField('start')}>
                <Text style={styles.text}>Start date: {start}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={saving} style={styles.date} onPress={() => setField('end')}>
                <Text style={styles.text}>End date: {end}</Text>
            </TouchableOpacity>
            {field && <Calendar key={field} current={field === 'start' ? start : end}
                minDate={field === 'end' ? start : undefined}
                markedDates={{ [field === 'start' ? start : end]: { selected: true, selectedColor: '#B99A4A' } }}
                onDayPress={({ dateString }) => { if (field === 'start') setStart(dateString); else setEnd(dateString); setField(null); }} />}
            {usage ? <Text accessibilityLiveRegion="polite" style={styles.text}>
                {usage.durationDays} days · {usage.seatPeriods} seat periods{'\n'}
                {usage.participants} participants × {usage.seatPeriods} = {usage.requiredSeats} seats required{'\n'}
                {extra} additional seats · {balance ?? '—'} available
            </Text> : <Text style={styles.error}>Choose an end date on or after the start date.</Text>}
            <Text style={styles.text}>Shortening the trip retains its allocated seats for future date or capacity changes.</Text>
            {insufficient && <Text style={styles.error}>Not enough available seats to confirm these dates.</Text>}
            <TouchableOpacity accessibilityRole="button" disabled={saving || !usage || insufficient || !destination.trim()}
                style={[styles.button, (saving || !usage || insufficient || !destination.trim()) && { opacity: 0.4 }]}
                onPress={() => Alert.alert('Confirm trip details', `${destination.trim()}\n${usage.requiredSeats} seats required. This change uses ${extra} additional seats from your organization.`, [
                    { text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: save },
                ])}>
                {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Review and save</Text>}
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={saving} style={styles.date} onPress={() => { setEditing(false); setField(null); }}>
                <Text style={styles.text}>Cancel</Text>
            </TouchableOpacity>
        </>}
    </View>;
}

const styles = StyleSheet.create({
    card: { padding: 16, marginVertical: 16, backgroundColor: '#1C2426', borderRadius: 16, gap: 12 },
    heading: { color: '#FFF', fontSize: 18, fontWeight: '600' },
    text: { color: '#EEE', lineHeight: 22 },
    error: { color: '#FCA5A5', lineHeight: 22 },
    destination: { borderWidth: 1, borderColor: '#596164', borderRadius: 12, padding: 12 },
    date: { paddingVertical: 10 },
    button: { backgroundColor: '#B99A4A', borderRadius: 24, padding: 14, alignItems: 'center' },
    buttonText: { color: '#FFF', fontWeight: '600' },
});
