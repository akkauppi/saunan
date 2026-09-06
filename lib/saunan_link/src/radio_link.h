#pragma once
#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include "latest_sample.h"
#include "radio_config.h"
namespace sauna_link {
struct ReceivedDatagram {
  uint8_t bytes[sauna_wire::kMaximumDatagramBytes]{};
  uint16_t size=0;
  uint64_t receivedAtMs=0;
  uint8_t peer[6]{};
};
class RadioLink {
 public:
  void begin(bool sender);
  bool command(const String& line, bool recordingActive);
  void offer(const sauna_wire::SampleV1& sample);
  void poll(uint64_t now);
  bool receive(ReceivedDatagram& packet);
  const RadioConfig& config() const { return config_; }
  bool enabled() const { return enabled_; }
  bool fault() const { return fault_; }
  bool restartRequired() const { return restartRequired_; }
  uint64_t localSourceId() const { return localSourceId_; }
  // Called only by SDK callbacks; bounded queue operations, no application work.
  void onReceive(const uint8_t* peer,const uint8_t* bytes,int size);
  void onSend(bool success);
 private:
  RadioConfig config_{};
  LatestSample pending_{};
  uint8_t inFlight_[sauna_wire::kSampleV1Bytes]{};
  QueueHandle_t receiveQueue_=nullptr,sendQueue_=nullptr;
  uint64_t localSourceId_=0,sentAt_=0;
  uint8_t localMac_[6]{};
  bool sender_=false,enabled_=false,fault_=false,busy_=false,restartRequired_=false;
  uint32_t offered_=0,sent_=0,failed_=0,timeouts_=0;
  void stop();
  bool save(const RadioConfig& config);
};
}  // namespace sauna_link
