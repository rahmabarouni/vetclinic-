import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/appointments_provider.dart';
import '../providers/pets_provider.dart';
import '../theme/app_theme.dart';

class AppointmentFormScreen extends ConsumerStatefulWidget {
  const AppointmentFormScreen({super.key});

  @override
  ConsumerState<AppointmentFormScreen> createState() => _AppointmentFormScreenState();
}

class _AppointmentFormScreenState extends ConsumerState<AppointmentFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _reasonController = TextEditingController();
  String? _selectedPetId;
  String _appointmentType = 'CONSULTATION';
  DateTime _selectedDate = DateTime.now().add(const Duration(days: 1));
  TimeOfDay _selectedTime = const TimeOfDay(hour: 10, minute: 0);
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final petsState = ref.read(petsProvider);
    if (petsState.status == PetsStatus.initial) {
      ref.read(petsProvider.notifier).loadPets();
    }
  }

  @override
  void dispose() {
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _selectedDate = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _selectedTime,
    );
    if (picked != null) setState(() => _selectedTime = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedPetId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Sélectionnez un animal'), backgroundColor: Colors.red),
      );
      return;
    }

    setState(() => _submitting = true);

    final start = DateTime(
      _selectedDate.year,
      _selectedDate.month,
      _selectedDate.day,
      _selectedTime.hour,
      _selectedTime.minute,
    );
    final end = start.add(const Duration(hours: 1));

    final success = await ref.read(appointmentsProvider.notifier).createAppointment(
      petId: _selectedPetId!,
      appointmentType: _appointmentType,
      scheduledStart: start,
      scheduledEnd: end,
      reason: _reasonController.text.trim().isEmpty ? null : _reasonController.text.trim(),
    );

    setState(() => _submitting = false);

    if (success && mounted) {
      Navigator.pop(context, true);
    } else if (mounted) {
      final error = ref.read(appointmentsProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error ?? 'Erreur lors de la création'), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final petsState = ref.watch(petsProvider);
    final pets = petsState.pets;

    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau rendez-vous')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              DropdownButtonFormField<String>(
                initialValue: _selectedPetId,
                decoration: const InputDecoration(
                  labelText: 'Animal *',
                  prefixIcon: Icon(Icons.pets),
                  border: OutlineInputBorder(),
                ),
                items: pets.map((pet) {
                  return DropdownMenuItem(value: pet.id, child: Text(pet.name));
                }).toList(),
                onChanged: (v) => setState(() => _selectedPetId = v),
                validator: (v) => v == null ? 'Sélectionnez un animal' : null,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _appointmentType,
                decoration: const InputDecoration(
                  labelText: 'Type *',
                  prefixIcon: Icon(Icons.category),
                  border: OutlineInputBorder(),
                ),
                items: const [
                  DropdownMenuItem(value: 'CONSULTATION', child: Text('Consultation')),
                  DropdownMenuItem(value: 'VACCINATION', child: Text('Vaccination')),
                  DropdownMenuItem(value: 'SURGERY', child: Text('Chirurgie')),
                  DropdownMenuItem(value: 'EMERGENCY', child: Text('Urgence')),
                  DropdownMenuItem(value: 'CHECKUP', child: Text('Contrôle')),
                  DropdownMenuItem(value: 'GROOMING', child: Text('Toilettage')),
                ],
                onChanged: (v) => setState(() => _appointmentType = v ?? 'CONSULTATION'),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickDate,
                      icon: const Icon(Icons.calendar_today),
                      label: Text(
                        '${_selectedDate.day}/${_selectedDate.month}/${_selectedDate.year}',
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _pickTime,
                      icon: const Icon(Icons.access_time),
                      label: Text(
                        '${_selectedTime.hour.toString().padLeft(2, '0')}:${_selectedTime.minute.toString().padLeft(2, '0')}',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _reasonController,
                decoration: const InputDecoration(
                  labelText: 'Motif',
                  prefixIcon: Icon(Icons.notes),
                  border: OutlineInputBorder(),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 24),
              SizedBox(
                height: 48,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                  ),
                  child: _submitting
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Créer le rendez-vous'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
