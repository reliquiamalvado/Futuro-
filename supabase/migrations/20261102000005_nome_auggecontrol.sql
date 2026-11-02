-- Plataforma renomeada para AuggeControl.
update public.device_drivers
   set name = 'AuggeControl ESP32',
       manufacturer = 'AuggeControl',
       description = 'Firmware AuggeControl para ESP32 com módulo relé. Conecta-se à nuvem por HTTPS (long-polling), sem abrir portas no roteador.'
 where id = 'dc-esp32-https';
